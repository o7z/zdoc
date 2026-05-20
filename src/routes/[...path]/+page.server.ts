import { existsSync, statSync } from 'node:fs';
import { dirname, basename, join, resolve, sep } from 'node:path';
import { error, redirect } from '@sveltejs/kit';
import { renderMarkdownCached } from '$lib/markdown.js';
import { resolveDocsDir, stripSkPrefix, isSpecKitPath } from '$lib/mode.js';
import { readDirMeta, type DirMeta, type Lifecycle, type PageMeta } from '$lib/meta.js';
import type { PageServerLoad } from './$types';

const IS_PROD = process.env.NODE_ENV === 'production';

interface DocMeta {
	description?: string;
	author?: string;
	modified?: string;
	lifecycle?: Lifecycle;
	superseded_by?: string;
	folded_to?: string;
}

function visible(meta: PageMeta): boolean {
	if (!meta.title) return false;
	// v2: visibility: prod-only is the canonical spelling; env: prod is
	// the legacy form (still accepted at parse time).
	const prodOnly = meta.visibility === 'prod-only' || meta.env === 'prod';
	if (prodOnly && !IS_PROD) return false;
	return true;
}

// v2 schema lookup: prefer `children` list, fall back to legacy `pages` map.
// Matches the sidebar's resolution order (src/lib/sidebar.ts).
function findEntry(parentMeta: DirMeta | null, key: string): PageMeta | undefined {
	if (!parentMeta) return undefined;
	if (parentMeta.children) {
		const hit = parentMeta.children.find((c) => c.name === key);
		if (hit) return hit;
	}
	return parentMeta.pages?.[key];
}

function extractDocMeta(meta: PageMeta): DocMeta | undefined {
	const out: DocMeta = {};
	if (meta.description) out.description = meta.description;
	if (meta.author) out.author = meta.author;
	if (meta.modified) out.modified = meta.modified;
	if (meta.lifecycle) out.lifecycle = meta.lifecycle;
	if (meta.superseded_by) out.superseded_by = meta.superseded_by;
	if (meta.folded_to) out.folded_to = meta.folded_to;
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

export const load: PageServerLoad = async ({ params, url }) => {
	const pathname = url.pathname;
	const rawSlug = isSpecKitPath(pathname) ? stripSkPrefix(pathname) : (params.path || '');
	const docsDir = resolveDocsDir(pathname) ?? resolve(process.cwd());
	const slug = rawSlug || '';

	if (/\.pdf$/i.test(slug)) {
		const pdfPath = safeJoin(docsDir, slug);
		if (!pdfPath || !existsSync(pdfPath) || !statSync(pdfPath).isFile()) {
			error(404, `Page not found: ${slug}`);
		}

		const filename = basename(pdfPath);
		const parentMeta = readDirMeta(join(dirname(pdfPath), '_meta.yaml'));
		const pageMeta = findEntry(parentMeta, filename);
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
		const pageMeta = findEntry(parentMeta, key);
		if (!pageMeta || !visible(pageMeta)) {
			error(404, `Page not found: ${slug}`);
		}

		const { html, headings } = await renderMarkdownCached(asFile);
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
		const pageMeta = findEntry(parentMeta, key);
		if (pageMeta && visible(pageMeta)) {
			throw redirect(301, '/' + mdSlug);
		}
	}

	error(404, `Page not found: ${slug}`);
};
