import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { parseDocMeta } from '$lib/sidebar.js';
import { extractMeta, hasBody, stripMetaComments } from '$lib/meta.js';
import type { PageServerLoad } from './$types';

function safeJoin(root: string, slug: string): string | null {
	const normRoot = resolve(root);
	const resolved = resolve(normRoot, slug);
	if (resolved !== normRoot && !resolved.startsWith(normRoot + sep)) {
		return null;
	}
	return resolved;
}

export const load: PageServerLoad = async ({ params }) => {
	const docsDir = getDocsDir();
	const slug = params.path || '';

	if (/\.pdf$/i.test(slug)) {
		const pdfPath = safeJoin(docsDir, slug);
		if (!pdfPath || !existsSync(pdfPath) || !statSync(pdfPath).isFile()) {
			error(404, `Page not found: ${slug}`);
		}

		const metaFile = pdfPath + '.meta.md';
		const meta = existsSync(metaFile) ? parseDocMeta(metaFile) : {};
		const title = meta.title ?? slug.split('/').pop()!.replace(/\.pdf$/i, '');

		return {
			kind: 'pdf' as const,
			title,
			pdfUrl: '/api/pdf/' + slug.split('/').map(encodeURIComponent).join('/'),
			path: slug,
		};
	}

	const asFile = safeJoin(docsDir, slug + '.md');
	const asMeta = safeJoin(docsDir, join(slug, '_meta.md'));
	const asIndex = safeJoin(docsDir, join(slug, 'index.md'));

	if (!asFile || !asMeta || !asIndex) {
		error(404, `Page not found: ${slug}`);
	}

	if (existsSync(asFile)) {
		const raw = readFileSync(asFile, 'utf-8');
		const meta = extractMeta(raw);
		if (!meta.title) error(404, `Page not found: ${slug}`);
		const html = await renderMarkdown(raw);
		return { kind: 'md' as const, title: meta.title, html, path: slug };
	}

	if (existsSync(asMeta)) {
		const raw = readFileSync(asMeta, 'utf-8');
		const meta = extractMeta(raw);
		if (!meta.title) error(404, `Page not found: ${slug}`);

		if (hasBody(raw)) {
			const html = await renderMarkdown(stripMetaComments(raw));
			return { kind: 'md' as const, title: meta.title, html, path: slug };
		}

		if (existsSync(asIndex)) {
			const raw2 = readFileSync(asIndex, 'utf-8');
			const html = await renderMarkdown(raw2);
			return { kind: 'md' as const, title: meta.title, html, path: slug };
		}
	}

	if (existsSync(asIndex)) {
		const raw = readFileSync(asIndex, 'utf-8');
		const meta = extractMeta(raw);
		if (!meta.title) error(404, `Page not found: ${slug}`);
		const html = await renderMarkdown(raw);
		return { kind: 'md' as const, title: meta.title, html, path: slug };
	}

	error(404, `Page not found: ${slug}`);
};
