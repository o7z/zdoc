// /llms.txt — concise sitemap for LLMs (https://llmstxt.org).
//
// Structure: site title + tagline + sectioned list of links with
// one-line descriptions. Pages with `lifecycle: archived` are excluded.
// Pages with `superseded_by` are annotated so the AI follows the pointer.

import { walkDocs, filterByLifecycle, type DirNode } from '$lib/docs-walker.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { getConfig } from '$lib/config.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const docsDir = getDocsDir();
	const tree = walkDocs(docsDir);
	if (!tree) {
		return new Response('No docs found', {
			status: 404,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const title = getConfig().title;
	const lines: string[] = [];
	lines.push(`# ${title}`);
	lines.push('');
	lines.push(`> ${title} documentation, served live by zdoc.`);
	lines.push(`> Generated at ${new Date().toISOString()}.`);
	lines.push('> Pages marked archived or superseded are filtered out.');
	lines.push('');

	function visit(node: DirNode, depth: number) {
		const visiblePages = filterByLifecycle(node.pages);
		const hasContent = visiblePages.length > 0 || hasVisibleDescendant(node);
		if (!hasContent) return;

		if (node.dirPath !== '') {
			const heading = '#'.repeat(Math.min(depth + 1, 6));
			lines.push(`${heading} ${node.title}`);
			lines.push('');
		}

		for (const page of visiblePages) {
			let line = `- [${page.title}](${page.link})`;
			const annotations: string[] = [];
			if (page.description) annotations.push(page.description);
			if (page.superseded_by) annotations.push(`superseded by ${page.superseded_by}`);
			if (page.folded_to) annotations.push(`content folded to ${page.folded_to}`);
			if (annotations.length > 0) line += `: ${annotations.join('; ')}`;
			lines.push(line);
		}
		if (visiblePages.length > 0) lines.push('');

		for (const child of node.children) visit(child, depth + 1);
	}

	visit(tree, 0);

	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'private, max-age=0',
		},
	});
};

function hasVisibleDescendant(node: DirNode): boolean {
	if (filterByLifecycle(node.pages).length > 0) return true;
	for (const c of node.children) if (hasVisibleDescendant(c)) return true;
	return false;
}
