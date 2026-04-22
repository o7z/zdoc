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

const rehypeCodeCopy: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'pre' || !parent || index === null) return;
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
			parent.children[index] = wrapper;
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
		.use(rehypeCodeCopy)
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
