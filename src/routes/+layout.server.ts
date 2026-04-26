import { buildSidebar } from '$lib/sidebar.js';
import { buildSearchIndex } from '$lib/search-index.js';
import { getConfig } from '$lib/config.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const config = getConfig();
	const sidebar = buildSidebar(config.docsDir);
	const searchIndex = await buildSearchIndex(config.docsDir);
	return {
		sidebar,
		searchIndex,
		siteTitle: config.title,
		repoUrl: process.env.ZDOC_REPO_URL ?? '',
	};
};
