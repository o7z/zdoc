import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { readDirMeta, type Lifecycle, type PageMeta } from './meta.js';

export interface SidebarGroup {
	text: string;
	link?: string;
	collapsed?: boolean;
	items?: SidebarGroup[];
	lifecycle?: Lifecycle;
	superseded?: boolean;
	specKit?: boolean;
}

const IS_PROD = process.env.NODE_ENV === 'production';

type SpecKitSet = Set<string>;

function visible(meta: PageMeta): boolean {
	if (meta.env === 'prod' && !IS_PROD) return false;
	return true;
}

interface TocEntry {
	href?: string;
	items?: TocEntry[];
}

function parseTocYml(docsDir: string): SpecKitSet {
	const tocPath = join(docsDir, 'toc.yml');
	if (!existsSync(tocPath)) return new Set();

	const content = readFileSync(tocPath, 'utf-8');
	const hrefs: string[] = [];
	const hrefRe = /href:\s*(.+)$/gm;
	let m;
	while ((m = hrefRe.exec(content)) !== null) {
		hrefs.push(m[1].trim());
	}

	const paths = new Set<string>();
	const dirs = new Set<string>();
	for (const h of hrefs) {
		paths.add(h);
		const parent = dirname(h).replace(/\\/g, '/');
		if (parent !== '.') dirs.add(parent);
	}

	const result = new Set<string>();
	for (const p of paths) result.add(p);
	for (const d of dirs) result.add(d);
	return result;
}

function isSpecKitFile(relPath: string, specKitSet: SpecKitSet): boolean {
	if (specKitSet.has(relPath)) return true;
	for (const prefix of specKitSet) {
		if (prefix.endsWith('/')) {
			if (relPath.startsWith(prefix)) return true;
		} else {
			if (relPath.startsWith(prefix + '/')) return true;
		}
	}
	return false;
}

export function buildSidebar(docsDir: string): SidebarGroup[] {
	if (!existsSync(docsDir)) return [];
	const specKitSet = parseTocYml(docsDir);
	return scanDir(docsDir, docsDir, specKitSet);
}

interface SortableItem {
	item: SidebarGroup;
	order: number;
	text: string;
	specKit: boolean;
}

function scanDir(dir: string, root: string, specKitSet: SpecKitSet): SidebarGroup[] {
	const items: SortableItem[] = [];

	const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
	const dirs = entries.filter((e) => e.isDirectory());

	for (const d of dirs) {
		const fullPath = join(dir, d.name);
		const meta = readDirMeta(join(fullPath, '_meta.yaml'));
		if (!meta || !meta.title || !visible(meta)) continue;

		const children = scanDir(fullPath, root, specKitSet);

		const dirRelPath = relative(root, fullPath).replace(/\\/g, '/');
		const dirIsSpecKit = children.length > 0 && children.every((c) => c.specKit);

		items.push({
			order: meta.order ?? 999,
			text: meta.title,
			specKit: dirIsSpecKit,
			item: {
				text: meta.title,
				collapsed: false,
				items: children.length > 0 ? children : undefined,
				specKit: dirIsSpecKit,
			},
		});
	}

	const dirMeta = readDirMeta(join(dir, '_meta.yaml'));
	const pages = dirMeta?.pages ?? {};
	for (const [key, meta] of Object.entries(pages)) {
		if (!meta.title || !visible(meta)) continue;

		const targetPath = join(dir, key.endsWith('.pdf') ? key : key + '.md');
		if (!existsSync(targetPath) || !statSync(targetPath).isFile()) continue;

		const rel = relative(root, targetPath).replace(/\\/g, '/');
		const link = '/' + rel;
		const fileIsSpecKit = isSpecKitFile(rel, specKitSet);

		items.push({
			order: meta.order ?? 999,
			text: meta.title,
			specKit: fileIsSpecKit,
			item: {
				text: meta.title,
				link,
				lifecycle: meta.lifecycle,
				superseded: Boolean(meta.superseded_by),
				specKit: fileIsSpecKit,
			},
		});
	}

	items.sort((a, b) => a.order - b.order || a.text.localeCompare(b.text));
	return items.map((i) => i.item);
}
