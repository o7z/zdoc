import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, basename, join, resolve, sep } from 'node:path';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { renderMarkdown } from '$lib/markdown.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { readDirMeta } from '$lib/meta.js';

function safeJoin(root: string, slug: string): string | null {
	const normRoot = resolve(root);
	const resolved = resolve(normRoot, slug);
	if (resolved !== normRoot && !resolved.startsWith(normRoot + sep)) {
		return null;
	}
	return resolved;
}

function extractAnchorFragment(html: string, anchor: string): string {
	const idAttr = `id="${anchor}"`;
	const idx = html.indexOf(idAttr);
	if (idx === -1) return html;

	const before = html.substring(0, idx);
	const tagStart = html.lastIndexOf('<', idx);
	if (tagStart === -1) return html;

	const tagMatch = html.substring(tagStart).match(/^<(h[1-6])[\s>]/i);
	if (!tagMatch) return html;

	const headingTag = tagMatch[1].toLowerCase();
	const headingLevel = parseInt(headingTag[1]);

	const fromTagStart = html.substring(tagStart);
	const closeMatch = fromTagStart.match(new RegExp(`</${headingTag}>`, 'i'));
	if (!closeMatch) return html;

	const headingEnd = tagStart + closeMatch.index! + closeMatch[0].length;

	let searchFrom = headingEnd;
	let depth = 0;
	let endPos = html.length;

	const tagRe = /<(\/?)(h[1-6])[\s>\/]/gi;
	let m: RegExpExecArray | null;
	tagRe.lastIndex = searchFrom;

	while ((m = tagRe.exec(html)) !== null) {
		const isClosing = m[1] === '/';
		const level = parseInt(m[2][1]);
		if (!isClosing && level <= headingLevel) {
			endPos = m.index;
			break;
		}
	}

	return html.substring(tagStart, endPos);
}

export const GET: RequestHandler = async ({ url }) => {
	const docsDir = getDocsDir();
	const pathParam = url.searchParams.get('path') || '';
	const anchor = url.searchParams.get('anchor') || '';

	if (!pathParam) {
		error(400, 'Missing path parameter');
	}

	if (!/\.md$/i.test(pathParam)) {
		error(400, 'Only markdown files are supported');
	}

	const filePath = safeJoin(docsDir, pathParam);
	if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
		error(404, 'File not found');
	}

	const key = basename(filePath).replace(/\.md$/, '');
	const parentMeta = readDirMeta(join(dirname(filePath), '_meta.yaml'));
	const pageMeta = parentMeta?.pages?.[key];
	if (!pageMeta || !pageMeta.title) {
		error(404, 'Page not found');
	}

	const raw = readFileSync(filePath, 'utf-8');
	const { html, headings } = await renderMarkdown(raw);

	const fragmentHtml = anchor ? extractAnchorFragment(html, anchor) : html;

	return json({
		title: pageMeta.title,
		html: fragmentHtml,
		headings,
	});
};
