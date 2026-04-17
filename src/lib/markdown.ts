import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { visit } from 'unist-util-visit';
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

export async function renderMarkdown(md: string): Promise<RenderResult> {
	md = md.replace(/^---\n[\s\S]*?\n---\n/, '');

	const mermaidBlocks: string[] = [];
	const placeholder = '___MERMAID_PLACEHOLDER___';
	const processed = md.replace(/```mermaid\n([\s\S]*?)```/g, (_: string, code: string) => {
		mermaidBlocks.push(code.trim());
		return placeholder;
	});

	const headings: Heading[] = [];
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeSlug)
		.use(collectHeadings, { out: headings })
		.use(rehypeHighlight, { detect: true, ignoreMissing: true })
		.use(rehypeStringify, { allowDangerousHtml: true });

	const result = await processor.process(processed);
	let html = String(result);

	let i = 0;
	html = html.replace(new RegExp(`<p>${placeholder}</p>`, 'g'), () => {
		const code = mermaidBlocks[i++] || '';
		return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
	});

	return { html, headings };
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
