// /api/docs.json — structured doc tree + per-page metadata.
// Query params:
//   ?lifecycle=stable|draft|archived  filter pages by lifecycle
//   ?include_archived=1               include archived in output (default: excluded)

import { json } from '@sveltejs/kit';
import { walkDocs, type DirNode, type PageEntry } from '$lib/docs-walker.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { getConfig } from '$lib/config.js';
import type { Lifecycle } from '$lib/meta.js';
import type { RequestHandler } from './$types';

interface ApiPage {
	path: string;
	link: string;
	title: string;
	order: number;
	lifecycle?: Lifecycle;
	superseded_by?: string;
	folded_to?: string;
	description?: string;
	author?: string;
	modified?: string;
}

interface ApiDirNode {
	title: string;
	order: number;
	dirPath: string;
	pages: ApiPage[];
	children: ApiDirNode[];
}

const VALID_LIFECYCLES: ReadonlySet<Lifecycle> = new Set(['draft', 'stable', 'archived']);

function pageMatches(p: PageEntry, lifecycleFilter: Lifecycle | null, includeArchived: boolean): boolean {
	if (!includeArchived && p.lifecycle === 'archived') return false;
	if (lifecycleFilter && p.lifecycle !== lifecycleFilter) return false;
	return true;
}

function projectPage(p: PageEntry): ApiPage {
	const out: ApiPage = { path: p.path, link: p.link, title: p.title, order: p.order };
	if (p.lifecycle) out.lifecycle = p.lifecycle;
	if (p.superseded_by) out.superseded_by = p.superseded_by;
	if (p.folded_to) out.folded_to = p.folded_to;
	if (p.description) out.description = p.description;
	if (p.author) out.author = p.author;
	if (p.modified) out.modified = p.modified;
	return out;
}

function projectNode(node: DirNode, lifecycleFilter: Lifecycle | null, includeArchived: boolean): ApiDirNode {
	return {
		title: node.title,
		order: node.order,
		dirPath: node.dirPath,
		pages: node.pages.filter((p) => pageMatches(p, lifecycleFilter, includeArchived)).map(projectPage),
		children: node.children.map((c) => projectNode(c, lifecycleFilter, includeArchived)),
	};
}

export const GET: RequestHandler = ({ url }) => {
	const docsDir = getDocsDir();
	const tree = walkDocs(docsDir);
	if (!tree) return json({ error: 'No docs found' }, { status: 404 });

	const lifecycleParam = url.searchParams.get('lifecycle');
	const lifecycleFilter: Lifecycle | null =
		lifecycleParam && VALID_LIFECYCLES.has(lifecycleParam as Lifecycle)
			? (lifecycleParam as Lifecycle)
			: null;
	const includeArchived = url.searchParams.get('include_archived') === '1';

	return json({
		title: getConfig().title,
		generatedAt: new Date().toISOString(),
		filters: {
			...(lifecycleFilter && { lifecycle: lifecycleFilter }),
			includeArchived,
		},
		tree: projectNode(tree, lifecycleFilter, includeArchived),
	});
};
