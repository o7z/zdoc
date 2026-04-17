import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeHighlight, { detect: true, ignoreMissing: true })
	.use(rehypeStringify, { allowDangerousHtml: true });

export async function renderMarkdown(md: string): Promise<string> {
	md = md.replace(/^---\n[\s\S]*?\n---\n/, '');

	const mermaidBlocks: string[] = [];
	const placeholder = '___MERMAID_PLACEHOLDER___';
	const processed = md.replace(/```mermaid\n([\s\S]*?)```/g, (_: string, code: string) => {
		mermaidBlocks.push(code.trim());
		return placeholder;
	});

	const result = await processor.process(processed);
	let html = String(result);

	let i = 0;
	html = html.replace(new RegExp(`<p>${placeholder}</p>`, 'g'), () => {
		const code = mermaidBlocks[i++] || '';
		return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
	});

	return html;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
