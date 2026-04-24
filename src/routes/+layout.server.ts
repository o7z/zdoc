import { buildSidebar } from '$lib/sidebar.js';
import { getConfig } from '$lib/config.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	const config = getConfig();
	const sidebar = buildSidebar(config.docsDir);
	return {
		sidebar,
		siteTitle: config.title,
		version: process.env.ZDOC_VERSION ?? '',
		repoUrl: process.env.ZDOC_REPO_URL ?? '',
	};
};
