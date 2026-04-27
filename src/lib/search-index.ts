import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readDirMeta, type PageMeta } from './meta.js';
import type { Element, ElementContent, Root, RootContent } from 'hast';

export interface SearchEntry {
	link: string;
	pageTitle: string;
	heading: string;
	headingDepth: 0 | 1 | 2 | 3;
	content: string;
}

const IS_PROD = process.env.NODE_ENV === 'production';

const SKIP_TAGS = new Set(['pre', 'code', 'figure', 'style', 'script']);

function visible(meta: PageMeta): boolean {
	if (meta.env === 'prod' && !IS_PROD) return false;
	return true;
}

function textOfHast(node: ElementContent | Root): string {
	if (node.type === 'text') return node.value;
	if (node.type === 'element' && SKIP_TAGS.has(node.tagName)) return '';
	if ('children' in node && node.children) {
		return (node.children as ElementContent[]).map(textOfHast).join('');
	}
	return '';
}

interface CurrentSection {
	heading: string;
	depth: 0 | 1 | 2 | 3;
	slug: string;
	content: string;
}

async function indexFile(
	mdPath: string,
	link: string,
	pageTitle: string,
): Promise<SearchEntry[]> {
	let md: string;
	try {
		md = readFileSync(mdPath, 'utf-8');
	} catch {
		return [];
	}
	md = md.replace(/^---\n[\s\S]*?\n---\n/, '');

	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeSlug);

	let tree: Root;
	try {
		const parsed = processor.parse(md);
		tree = (await processor.run(parsed)) as Root;
	} catch (e) {
		console.warn(`[search-index] parse failed for ${mdPath}:`, e);
		return [];
	}

	const sections: SearchEntry[] = [];
	let cur: CurrentSection = {
		heading: pageTitle,
		depth: 0,
		slug: '',
		content: '',
	};

	const flush = () => {
		const trimmed = cur.content.replace(/\s+/g, ' ').trim();
		if (cur.depth === 0 && !trimmed) return;
		sections.push({
			link: cur.slug ? `${link}#${cur.slug}` : link,
			pageTitle,
			heading: cur.heading,
			headingDepth: cur.depth,
			content: trimmed,
		});
	};

	for (const child of tree.children as RootContent[]) {
		if (child.type !== 'element') {
			if (child.type === 'text') cur.content += child.value + ' ';
			continue;
		}
		const el = child as Element;
		const tag = el.tagName;
		if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
			flush();
			const slug = (el.properties?.id as string | undefined) ?? '';
			const depth = Number(tag.slice(1)) as 1 | 2 | 3;
			cur = {
				heading: textOfHast(el).trim(),
				depth,
				slug,
				content: '',
			};
		} else if (SKIP_TAGS.has(tag)) {
			continue;
		} else {
			cur.content += textOfHast(el) + ' ';
		}
	}
	flush();

	return sections;
}

async function scanDir(dir: string, root: string, out: SearchEntry[]): Promise<void> {
	if (!existsSync(dir)) return;
	const dirMeta = readDirMeta(join(dir, '_meta.yaml'));
	if (dirMeta && visible(dirMeta)) {
		const pages = dirMeta.pages ?? {};
		for (const [key, meta] of Object.entries(pages)) {
			if (!meta.title || !visible(meta)) continue;
			if (meta.lifecycle === 'archived') continue;
			if (key.endsWith('.pdf')) continue;
			const mdPath = join(dir, key + '.md');
			if (!existsSync(mdPath) || !statSync(mdPath).isFile()) continue;
			const rel = relative(root, mdPath).replace(/\\/g, '/');
			const link = '/' + rel;
			const fileEntries = await indexFile(mdPath, link, meta.title);
			out.push(...fileEntries);
		}
	}

	const entries = readdirSync(dir, { withFileTypes: true }).filter(
		(e) => !e.name.startsWith('.'),
	);
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const sub = join(dir, e.name);
		const subMeta = readDirMeta(join(sub, '_meta.yaml'));
		if (!subMeta || !subMeta.title || !visible(subMeta)) continue;
		await scanDir(sub, root, out);
	}
}

export async function buildSearchIndex(docsDir: string): Promise<SearchEntry[]> {
	if (!existsSync(docsDir)) return [];
	const out: SearchEntry[] = [];
	await scanDir(docsDir, docsDir, out);
	return out;
}
