import { buildSidebar } from '$lib/sidebar.js';
import { buildSearchIndex } from '$lib/search-index.js';
import { getConfig } from '$lib/config.js';
import { resolveDocsDir, isSpecKitAvailable } from '$lib/mode.js';
import type { LayoutServerLoad } from './$types';

function readCollapsedGroups(raw: string | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(decodeURIComponent(raw));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x): x is string => typeof x === 'string');
	} catch {
		return [];
	}
}

export const load: LayoutServerLoad = async ({ url, cookies }) => {
	const pathname = url.pathname;
	const docsDir = resolveDocsDir(pathname);
	const config = getConfig();
	const mode = docsDir === config.specKitDir ? 'spec-kit' : 'zdoc';

	let sidebar = buildSidebar(docsDir);
	let searchIndex = await buildSearchIndex(docsDir);

	const specKitEnabled = isSpecKitAvailable();

	const collapsedGroups = readCollapsedGroups(cookies.get('zdoc-collapsed'));
	return {
		sidebar,
		searchIndex,
		siteTitle: config.title,
		repoUrl: process.env.ZDOC_REPO_URL ?? '',
		collapsedGroups,
		downloadEnabled: config.downloadEnabled,
		specKitEnabled,
		mode,
	};
};
