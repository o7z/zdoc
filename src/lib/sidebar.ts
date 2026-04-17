import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readDirMeta, type PageMeta } from './meta.js';

export interface SidebarGroup {
	text: string;
	link?: string;
	collapsed?: boolean;
	items?: SidebarGroup[];
}

const IS_PROD = process.env.NODE_ENV === 'production';

function visible(meta: PageMeta): boolean {
	if (meta.env === 'prod' && !IS_PROD) return false;
	return true;
}

export function buildSidebar(docsDir: string): SidebarGroup[] {
	if (!existsSync(docsDir)) return [];
	return scanDir(docsDir, docsDir);
}

interface SortableItem {
	item: SidebarGroup;
	order: number;
	text: string;
}

function scanDir(dir: string, root: string): SidebarGroup[] {
	const items: SortableItem[] = [];

	const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
	const dirs = entries.filter((e) => e.isDirectory());

	for (const d of dirs) {
		const fullPath = join(dir, d.name);
		const meta = readDirMeta(join(fullPath, '_meta.yaml'));
		if (!meta || !meta.title || !visible(meta)) continue;

		const children = scanDir(fullPath, root);
		const hasGuide = existsSync(join(fullPath, 'index.md'));

		items.push({
			order: meta.order ?? 999,
			text: meta.title,
			item: {
				text: meta.title,
				link: hasGuide ? '/' + relative(root, fullPath).replace(/\\/g, '/') : undefined,
				collapsed: false,
				items: children.length > 0 ? children : undefined,
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
		const link = key.endsWith('.pdf') ? '/' + rel : '/' + rel.replace(/\.md$/, '');

		items.push({
			order: meta.order ?? 999,
			text: meta.title,
			item: { text: meta.title, link },
		});
	}

	items.sort((a, b) => a.order - b.order || a.text.localeCompare(b.text));
	return items.map((i) => i.item);
}
