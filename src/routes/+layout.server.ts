import { buildSidebar } from '$lib/sidebar.js';
import { getConfig } from '$lib/config.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	const config = getConfig();
	const sidebar = buildSidebar(config.docsDir);
	return {
		sidebar,
		siteTitle: config.title,
	};
};
