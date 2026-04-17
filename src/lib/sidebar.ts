import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractMeta, hasBody, type DocMeta } from './meta.js';

export interface SidebarGroup {
	text: string;
	link?: string;
	collapsed?: boolean;
	items?: SidebarGroup[];
}

const IS_PROD = process.env.NODE_ENV === 'production';

export type { DocMeta };

export function buildSidebar(docsDir: string): SidebarGroup[] {
	if (!existsSync(docsDir)) return [];
	return scanDir(docsDir, docsDir);
}

interface SortableItem {
	item: SidebarGroup;
	order: number;
}

function scanDir(dir: string, root: string): SidebarGroup[] {
	const entries = readdirSync(dir, { withFileTypes: true })
		.filter((e) => !e.name.startsWith('.'))
		.sort((a, b) => a.name.localeCompare(b.name));

	const items: SortableItem[] = [];

	const dirs = entries.filter((e) => e.isDirectory());
	const mdFiles = entries.filter(
		(e) =>
			e.isFile() &&
			e.name.endsWith('.md') &&
			e.name !== '_meta.md' &&
			e.name !== 'index.md' &&
			!e.name.endsWith('.pdf.meta.md'),
	);
	const pdfFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.pdf'));

	for (const d of dirs) {
		const fullPath = join(dir, d.name);
		const metaPath = join(fullPath, '_meta.md');

		if (!existsSync(metaPath)) continue;

		const rawMeta = readFileSync(metaPath, 'utf-8');
		const meta = extractMeta(rawMeta);
		if (!meta.title) continue;
		if (meta.env === 'prod' && !IS_PROD) continue;

		const children = scanDir(fullPath, root);
		const hasGuide = hasBody(rawMeta) || existsSync(join(fullPath, 'index.md'));

		items.push({
			order: meta.order ?? 999,
			item: {
				text: meta.title,
				link: hasGuide ? '/' + relative(root, fullPath).replace(/\\/g, '/') : undefined,
				collapsed: false,
				items: children.length > 0 ? children : undefined,
			},
		});
	}

	for (const f of mdFiles) {
		const fullPath = join(dir, f.name);
		const meta = parseDocMeta(fullPath);

		if (!meta.title) continue;
		if (meta.env === 'prod' && !IS_PROD) continue;

		const rel = relative(root, fullPath).replace(/\\/g, '/').replace(/\.md$/, '');

		items.push({
			order: meta.order ?? 999,
			item: {
				text: meta.title,
				link: '/' + rel,
			},
		});
	}

	for (const f of pdfFiles) {
		const fullPath = join(dir, f.name);
		const metaFile = join(dir, f.name + '.meta.md');
		const meta = existsSync(metaFile) ? parseDocMeta(metaFile) : {};

		if (meta.env === 'prod' && !IS_PROD) continue;

		const title = meta.title ?? f.name.replace(/\.pdf$/i, '');
		const rel = relative(root, fullPath).replace(/\\/g, '/');

		items.push({
			order: meta.order ?? 999,
			item: {
				text: title,
				link: '/' + rel,
			},
		});
	}

	items.sort((a, b) => a.order - b.order || a.item.text.localeCompare(b.item.text));
	return items.map((i) => i.item);
}

export function parseDocMeta(filePath: string): DocMeta {
	try {
		return extractMeta(readFileSync(filePath, 'utf-8'));
	} catch {
		return {};
	}
}
