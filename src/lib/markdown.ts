import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { visit } from 'unist-util-visit';
import { readFileSync, statSync } from 'node:fs';
import type { Plugin } from 'unified';
import type { Root, Element, ElementContent } from 'hast';

export interface Heading {
	depth: 1 | 2 | 3;
	text: string;
	slug: string;
}

export interface RenderResult {
	html: string;
	headings: Heading[];
}

function textOf(node: Element | ElementContent): string {
	if ('value' in node && typeof node.value === 'string') return node.value;
	if ('children' in node && node.children) {
		return (node.children as ElementContent[]).map(textOf).join('');
	}
	return '';
}

const collectHeadings: Plugin<[{ out: Heading[] }], Root> = ({ out }) => {
	return (tree) => {
		visit(tree, 'element', (node) => {
			const tag = node.tagName;
			if (tag !== 'h1' && tag !== 'h2' && tag !== 'h3') return;
			const id = (node.properties?.id as string | undefined) ?? '';
			if (!id) return;
			const depth = Number(tag.slice(1)) as 1 | 2 | 3;
			out.push({ depth, text: textOf(node).trim(), slug: id });
		});
	};
};

const rehypeMermaid: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'pre' || !parent || index == null) return;
			const codeChild = node.children.find(
				(c): c is Element => c.type === 'element' && c.tagName === 'code',
			);
			if (!codeChild) return;
			const classes = (codeChild.properties?.className as string[]) ?? [];
			if (!classes.some((c) => c === 'language-mermaid')) return;
			const code = textOf(codeChild);
			parent.children[index as number] = {
				type: 'element',
				tagName: 'pre',
				properties: { className: ['mermaid'] },
				children: [{ type: 'text', value: code }],
			};
		});
	};
};

// Rewrite ```ejs fenced blocks so the client-side EjsPreview component can
// hydrate them. Mirrors the mermaid pattern: <pre><code class="language-ejs">…
// becomes <pre class="ejs-preview">…</pre> with the raw template as text. The
// client extracts the template, scans it for variable shapes, generates a form,
// and shows a live preview in a Web Worker sandbox.
const rehypeEjs: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'pre' || !parent || index == null) return;
			const codeChild = node.children.find(
				(c): c is Element => c.type === 'element' && c.tagName === 'code',
			);
			if (!codeChild) return;
			const classes = (codeChild.properties?.className as string[]) ?? [];
			if (!classes.some((c) => c === 'language-ejs')) return;
			const code = textOf(codeChild);
			parent.children[index as number] = {
				type: 'element',
				tagName: 'pre',
				properties: { className: ['ejs-preview'] },
				children: [{ type: 'text', value: code }],
			};
		});
	};
};

const rehypeExternalLinks: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, 'element', (node) => {
			if (node.tagName !== 'a') return;
			const href = (node.properties?.href as string) ?? '';
			if (!href) return;
			if (href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) return;
			try {
				const url = new URL(href);
				if (url.protocol === 'http:' || url.protocol === 'https:') {
					node.properties = { ...node.properties, target: '_blank', rel: 'noopener noreferrer' };
				}
			} catch {}
		});
	};
};

const rehypeCodeCopy: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'pre' || !parent || index == null) return;
			const preClasses = (node.properties?.className as string[]) ?? [];
			if (preClasses.includes('mermaid') || preClasses.includes('ejs-preview')) return;
			const codeChild = node.children.find(
				(c): c is Element => c.type === 'element' && c.tagName === 'code',
			);
			if (!codeChild) return;
			const wrapper: Element = {
				type: 'element',
				tagName: 'div',
				properties: { className: ['code-block'] },
				children: [
					{
						type: 'element',
						tagName: 'button',
						properties: { className: ['code-copy'], title: 'Copy' },
						children: [
							{
								type: 'element',
								tagName: 'svg',
								properties: {
									className: ['code-copy-icon'],
									width: 16,
									height: 16,
									viewBox: '0 0 24 24',
									fill: 'none',
									stroke: 'currentColor',
									'stroke-width': 2,
									'stroke-linecap': 'round',
									'stroke-linejoin': 'round',
								},
								children: [
									{ type: 'element', tagName: 'rect', properties: { x: 9, y: 9, width: 13, height: 13, rx: 2 }, children: [] },
									{ type: 'element', tagName: 'path', properties: { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }, children: [] },
								],
							},
							{
								type: 'element',
								tagName: 'svg',
								properties: {
									className: ['code-copy-check'],
									width: 16,
									height: 16,
									viewBox: '0 0 24 24',
									fill: 'none',
									stroke: 'currentColor',
									'stroke-width': 2,
									'stroke-linecap': 'round',
									'stroke-linejoin': 'round',
								},
								children: [
									{ type: 'element', tagName: 'path', properties: { d: 'M20 6 9 17l-5-5' }, children: [] },
								],
							},
						],
					},
					node,
				],
			};
			parent.children[index as number] = wrapper;
		});
	};
};

export async function renderMarkdown(md: string): Promise<RenderResult> {
	md = md.replace(/^---\n[\s\S]*?\n---\n/, '');

	const headings: Heading[] = [];
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeSlug)
		.use(collectHeadings, { out: headings })
		.use(rehypeHighlight, { detect: true, ignoreMissing: true })
		.use(rehypeEjs)
		.use(rehypeMermaid)
		.use(rehypeExternalLinks)
		.use(rehypeCodeCopy)
		.use(rehypeStringify, { allowDangerousHtml: true });

	const result = await processor.process(md);
	const html = String(result);

	return { html, headings };
}

interface RenderCacheEntry {
	mtimeMs: number;
	size: number;
	result: RenderResult;
}

const renderCache = new Map<string, RenderCacheEntry>();
const renderInFlight = new Map<string, Promise<RenderResult>>();

function deepFreezeResult(r: RenderResult): RenderResult {
	Object.freeze(r);
	Object.freeze(r.headings);
	for (const h of r.headings) Object.freeze(h);
	return r;
}

// Cached wrapper around renderMarkdown keyed by absolute file path + mtime + size.
// Reading the file is included inside the cached path so repeated navigations to
// the same doc skip both readFileSync and the unified pipeline.
export async function renderMarkdownCached(absPath: string): Promise<RenderResult> {
	let st: { mtimeMs: number; size: number };
	try {
		st = statSync(absPath);
	} catch {
		// File vanished between caller's existsSync and here; fall through to a
		// readFileSync that will throw the original ENOENT for the caller.
		const raw = readFileSync(absPath, 'utf-8');
		return renderMarkdown(raw);
	}

	const cached = renderCache.get(absPath);
	if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
		return cached.result;
	}

	const existing = renderInFlight.get(absPath);
	if (existing) return existing;

	const promise = (async () => {
		try {
			const raw = readFileSync(absPath, 'utf-8');
			const result = deepFreezeResult(await renderMarkdown(raw));
			renderCache.set(absPath, { mtimeMs: st.mtimeMs, size: st.size, result });
			return result;
		} finally {
			renderInFlight.delete(absPath);
		}
	})();
	renderInFlight.set(absPath, promise);
	return promise;
}

export function clearRenderCache(): void {
	renderCache.clear();
	renderInFlight.clear();
}

export function getRenderCacheSize(): number {
	return renderCache.size;
}
