import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, basename, join, resolve, sep } from 'node:path';
import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { readDirMeta, type PageMeta } from '$lib/meta.js';
import type { PageServerLoad } from './$types';

const IS_PROD = process.env.NODE_ENV === 'production';

function visible(meta: PageMeta): boolean {
	if (!meta.title) return false;
	if (meta.env === 'prod' && !IS_PROD) return false;
	return true;
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
		};
	}

	const asFile = safeJoin(docsDir, slug + '.md');
	if (asFile && existsSync(asFile) && statSync(asFile).isFile()) {
		const key = basename(asFile).replace(/\.md$/, '');
		const parentMeta = readDirMeta(join(dirname(asFile), '_meta.yaml'));
		const pageMeta = parentMeta?.pages?.[key];
		if (!pageMeta || !visible(pageMeta)) {
			error(404, `Page not found: ${slug}`);
		}

		const raw = readFileSync(asFile, 'utf-8');
		const html = await renderMarkdown(raw);
		return { kind: 'md' as const, title: pageMeta.title!, html, path: slug };
	}

	const asIndex = safeJoin(docsDir, join(slug, 'index.md'));
	const asMeta = safeJoin(docsDir, join(slug, '_meta.yaml'));
	if (asIndex && asMeta && existsSync(asIndex) && existsSync(asMeta)) {
		const dirMeta = readDirMeta(asMeta);
		if (!dirMeta || !visible(dirMeta)) {
			error(404, `Page not found: ${slug}`);
		}
		const raw = readFileSync(asIndex, 'utf-8');
		const html = await renderMarkdown(raw);
		return { kind: 'md' as const, title: dirMeta.title!, html, path: slug };
	}

	error(404, `Page not found: ${slug}`);
};
