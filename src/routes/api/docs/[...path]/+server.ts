// /api/docs/<path>(.json) — single doc as JSON.
//
// Returns raw markdown + metadata + rendered HTML + headings.
// The .json suffix on the URL is optional — both
//   /api/docs/guide/intro.md
//   /api/docs/guide/intro.md.json
// are accepted.

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
	if (resolved !== normRoot && !resolved.startsWith(normRoot + sep)) return null;
	return resolved;
}

export const GET: RequestHandler = async ({ params }) => {
	const docsDir = getDocsDir();
	let slug = params.path || '';
	if (slug.endsWith('.json')) slug = slug.slice(0, -5);

	if (!/\.md$/i.test(slug)) error(400, 'Only markdown files are supported');

	const filePath = safeJoin(docsDir, slug);
	if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
		error(404, 'File not found');
	}

	const key = basename(filePath).replace(/\.md$/, '');
	const parentMeta = readDirMeta(join(dirname(filePath), '_meta.yaml'));
	const pageMeta = parentMeta?.pages?.[key];
	if (!pageMeta || !pageMeta.title) {
		error(404, 'Page not registered in _meta.yaml');
	}

	const raw = readFileSync(filePath, 'utf-8');
	const cleaned = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
	const { html, headings } = await renderMarkdown(raw);

	const out: Record<string, unknown> = {
		path: slug,
		link: '/' + slug,
		title: pageMeta.title,
		markdown: cleaned,
		html,
		headings,
	};
	if (pageMeta.lifecycle) out.lifecycle = pageMeta.lifecycle;
	if (pageMeta.superseded_by) out.superseded_by = pageMeta.superseded_by;
	if (pageMeta.folded_to) out.folded_to = pageMeta.folded_to;
	if (pageMeta.description) out.description = pageMeta.description;
	if (pageMeta.author) out.author = pageMeta.author;
	if (pageMeta.modified) out.modified = pageMeta.modified;

	return json(out);
};
