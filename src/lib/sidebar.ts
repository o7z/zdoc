import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { readDirMeta, type Lifecycle, type PageMeta } from './meta.js';
import { createDocsCache } from './docs-cache.js';

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
	// v2-prep: visibility: prod-only is the new spelling of env: prod.
	// Both are accepted during the v1.x → 2.0 transition; either one
	// triggers the "hide outside production" behavior. See
	// docs/dev/next-major.md "env: → visibility: 字段重命名".
	const prodOnly = meta.visibility === 'prod-only' || meta.env === 'prod';
	if (prodOnly && !IS_PROD) return false;
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

const sidebarCache = createDocsCache<SidebarGroup[]>('sidebar');

export function buildSidebar(docsDir: string): SidebarGroup[] {
	return sidebarCache.get(docsDir, () => buildSidebarUncached(docsDir));
}

function buildSidebarUncached(docsDir: string): SidebarGroup[] {
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

	// v2-prep: when the dir uses the new `children:` schema, render file
	// entries from that list (preserving array order via implicit order =
	// (idx+1)*10). Subdir entries in children are intentionally skipped —
	// during v1.x they continue to surface through the 自发现 loop above,
	// preserving v1 behavior. The 2.0 cutover will switch to strict
	// position-based ordering.
	if (dirMeta?.children) {
		dirMeta.children.forEach((child, idx) => {
			if (!child.title || !visible(child)) return;
			// Skip when name maps to a directory (handled by 自发现)
			const subdirPath = join(dir, child.name);
			if (existsSync(subdirPath) && statSync(subdirPath).isDirectory()) return;

			const targetPath = join(
				dir,
				child.name.endsWith('.pdf') ? child.name : child.name + '.md',
			);
			if (!existsSync(targetPath) || !statSync(targetPath).isFile()) return;

			const rel = relative(root, targetPath).replace(/\\/g, '/');
			const link = '/' + rel;
			const fileIsSpecKit = isSpecKitFile(rel, specKitSet);

			items.push({
				order: child.order ?? (idx + 1) * 10,
				text: child.title,
				specKit: fileIsSpecKit,
				item: {
					text: child.title,
					link,
					lifecycle: child.lifecycle,
					superseded: Boolean(child.superseded_by),
					specKit: fileIsSpecKit,
				},
			});
		});
	} else {
		// v1: pages map (existing behavior unchanged)
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
	}

	items.sort((a, b) => a.order - b.order || a.text.localeCompare(b.text));
	return items.map((i) => i.item);
}

export function clearSidebarCache(): void {
	sidebarCache.clear();
}
