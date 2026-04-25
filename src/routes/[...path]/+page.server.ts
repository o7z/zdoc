import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, basename, join, resolve, sep } from 'node:path';
import { error, redirect } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { readDirMeta, type PageMeta } from '$lib/meta.js';
import type { PageServerLoad } from './$types';

const IS_PROD = process.env.NODE_ENV === 'production';

interface DocMeta {
	description?: string;
	version?: string;
	author?: string;
	modified?: string;
}

function visible(meta: PageMeta): boolean {
	if (!meta.title) return false;
	if (meta.env === 'prod' && !IS_PROD) return false;
	return true;
}

function extractDocMeta(meta: PageMeta): DocMeta | undefined {
	const out: DocMeta = {};
	if (meta.description) out.description = meta.description;
	if (meta.version) out.version = meta.version;
	if (meta.author) out.author = meta.author;
	if (meta.modified) out.modified = meta.modified;
	return Object.keys(out).length > 0 ? out : undefined;
}

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

		const filename = basename(pdfPath);
		const parentMeta = readDirMeta(join(dirname(pdfPath), '_meta.yaml'));
		const pageMeta = parentMeta?.pages?.[filename];
		if (!pageMeta || !visible(pageMeta)) {
			error(404, `Page not found: ${slug}`);
		}

		return {
			kind: 'pdf' as const,
			title: pageMeta.title!,
			pdfUrl: '/api/pdf/' + slug.split('/').map(encodeURIComponent).join('/'),
			path: slug,
			meta: extractDocMeta(pageMeta),
		};
	}

	if (/\.md$/i.test(slug)) {
		const asFile = safeJoin(docsDir, slug);
		if (!asFile || !existsSync(asFile) || !statSync(asFile).isFile()) {
			error(404, `Page not found: ${slug}`);
		}

		const key = basename(asFile).replace(/\.md$/, '');
		const parentMeta = readDirMeta(join(dirname(asFile), '_meta.yaml'));
		const pageMeta = parentMeta?.pages?.[key];
		if (!pageMeta || !visible(pageMeta)) {
			error(404, `Page not found: ${slug}`);
		}

		const raw = readFileSync(asFile, 'utf-8');
		const { html, headings } = await renderMarkdown(raw);
		return {
			kind: 'md' as const,
			title: pageMeta.title!,
			html,
			headings,
			path: slug,
			meta: extractDocMeta(pageMeta),
		};
	}

	const mdSlug = slug + '.md';
	const asFile = safeJoin(docsDir, mdSlug);
	if (asFile && existsSync(asFile) && statSync(asFile).isFile()) {
		const key = basename(asFile).replace(/\.md$/, '');
		const parentMeta = readDirMeta(join(dirname(asFile), '_meta.yaml'));
		const pageMeta = parentMeta?.pages?.[key];
		if (pageMeta && visible(pageMeta)) {
			throw redirect(301, '/' + mdSlug);
		}
	}

	error(404, `Page not found: ${slug}`);
};
