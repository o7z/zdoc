// /llms-full.txt — full-text dump of all stable docs concatenated.
// Pass ?include_archived=1 to include archived pages.

import { readFileSync } from 'node:fs';
import { walkDocs, flattenPages, filterByLifecycle } from '$lib/docs-walker.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { getConfig } from '$lib/config.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const docsDir = getDocsDir();
	const tree = walkDocs(docsDir);
	if (!tree) {
		return new Response('No docs found', {
			status: 404,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const includeArchived = url.searchParams.get('include_archived') === '1';
	const all = flattenPages(tree);
	const pages = filterByLifecycle(all, { includeArchived });

	const title = getConfig().title;
	const parts: string[] = [];
	parts.push(`# ${title} — Full Text Dump`);
	parts.push('');
	parts.push(`Generated at ${new Date().toISOString()}.`);
	parts.push(`Pages: ${pages.length}${includeArchived ? ' (archived included)' : ''}`);
	parts.push('');
	parts.push('---');
	parts.push('');

	for (const page of pages) {
		const breadcrumb = page.parentDirTitles.join(' / ');
		parts.push(`## ${page.title}`);
		parts.push('');
		parts.push(`Section: ${breadcrumb}`);
		parts.push(`Path: ${page.link}`);
		if (page.lifecycle) parts.push(`Lifecycle: ${page.lifecycle}`);
		if (page.superseded_by) parts.push(`Superseded by: ${page.superseded_by}`);
		if (page.folded_to) parts.push(`Folded to: ${page.folded_to}`);
		if (page.description) parts.push(`Description: ${page.description}`);
		if (page.author) parts.push(`Author: ${page.author}`);
		if (page.modified) parts.push(`Modified: ${page.modified}`);
		parts.push('');
		try {
			const raw = readFileSync(page.absPath, 'utf-8').replace(/^---\n[\s\S]*?\n---\n/, '');
			parts.push(raw.trimEnd());
		} catch {
			parts.push('_(file unreadable)_');
		}
		parts.push('');
		parts.push('---');
		parts.push('');
	}

	return new Response(parts.join('\n'), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'private, max-age=0',
		},
	});
};
