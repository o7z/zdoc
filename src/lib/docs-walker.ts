// Walk a zdoc docs/ tree producing structured page + directory metadata.
// Used by the LLM-friendly endpoints (/llms.txt, /llms-full.txt, /api/docs).
//
// Honors `_meta.yaml` visibility (env=prod hidden in dev) and exposes
// lifecycle / superseded_by / folded_to so consumers can filter or
// follow pointers.

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { readDirMeta, type Lifecycle, type PageMeta } from './meta.js';

const IS_PROD = process.env.NODE_ENV === 'production';

function visible(meta: PageMeta): boolean {
	if (meta.env === 'prod' && !IS_PROD) return false;
	return true;
}

export interface PageEntry {
	path: string;             // relative to docsDir, e.g. "guide/intro/install.md"
	link: string;             // url path with leading slash, e.g. "/guide/intro/install.md"
	title: string;
	order: number;
	lifecycle?: Lifecycle;
	superseded_by?: string;
	folded_to?: string;
	description?: string;
	author?: string;
	modified?: string;
	parentDirTitles: string[]; // ancestor _meta.yaml titles (for breadcrumb-style context)
	absPath: string;
}

export interface DirNode {
	title: string;
	order: number;
	dirPath: string;          // relative to docsDir, "" for the root
	pages: PageEntry[];
	children: DirNode[];
}

export function walkDocs(docsDir: string): DirNode | null {
	if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) return null;
	return scanDir(docsDir, docsDir, []);
}

function scanDir(dir: string, root: string, parentTitles: string[]): DirNode | null {
	const meta = readDirMeta(join(dir, '_meta.yaml'));
	if (!meta || !meta.title || !visible(meta)) return null;
	const titles = [...parentTitles, meta.title];

	const node: DirNode = {
		title: meta.title,
		order: meta.order ?? 999,
		dirPath: relative(root, dir).split(sep).join('/'),
		pages: [],
		children: [],
	};

	const pages = meta.pages ?? {};
	for (const [key, pmeta] of Object.entries(pages)) {
		if (!pmeta.title || !visible(pmeta)) continue;
		if (key.endsWith('.pdf')) continue; // PDFs are excluded from text-based AI consumption
		const target = join(dir, key + '.md');
		if (!existsSync(target) || !statSync(target).isFile()) continue;
		const rel = relative(root, target).split(sep).join('/');
		node.pages.push({
			path: rel,
			link: '/' + rel,
			title: pmeta.title,
			order: pmeta.order ?? 999,
			lifecycle: pmeta.lifecycle,
			superseded_by: pmeta.superseded_by,
			folded_to: pmeta.folded_to,
			description: pmeta.description,
			author: pmeta.author,
			modified: pmeta.modified,
			parentDirTitles: [...titles],
			absPath: target,
		});
	}
	node.pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

	const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const child = scanDir(join(dir, e.name), root, titles);
		if (child) node.children.push(child);
	}
	node.children.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

	return node;
}

export function flattenPages(node: DirNode): PageEntry[] {
	const out: PageEntry[] = [];
	function visit(n: DirNode) {
		out.push(...n.pages);
		for (const c of n.children) visit(c);
	}
	visit(node);
	return out;
}

// Filter pages by lifecycle. Excludes 'archived' by default (AI consumers
// generally shouldn't see retired content). Pass `includeArchived: true`
// to override.
//
// `lifecycle: 'stable'` matches pages explicitly marked stable AND pages
// without any lifecycle declared — `lifecycle` is optional, and an unset
// page is treated as the default ("stable enough"). Filtering by 'draft'
// or 'archived' stays strict, since those are explicit author intent.
export function filterByLifecycle(
	pages: PageEntry[],
	opts: { lifecycle?: Lifecycle; includeArchived?: boolean } = {},
): PageEntry[] {
	const { lifecycle, includeArchived = false } = opts;
	return pages.filter((p) => {
		if (!includeArchived && p.lifecycle === 'archived') return false;
		if (lifecycle === 'stable') return p.lifecycle === 'stable' || p.lifecycle === undefined;
		if (lifecycle && p.lifecycle !== lifecycle) return false;
		return true;
	});
}
