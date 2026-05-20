import { buildSidebar } from '$lib/sidebar.js';
import { buildSearchIndex } from '$lib/search-index.js';
import { getConfig } from '$lib/config.js';
import { resolveDocsDir, isSpecKitAvailable } from '$lib/mode.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LayoutServerLoad } from './$types';

function readAppVersion(): string {
	// bin/cli.ts sets ZDOC_VERSION from package.json at startup. After
	// SvelteKit build, __dirname resolves under .svelte-kit/output/server/...
	// where no package.json lives, so the env var is the only reliable source
	// during a real `zdoc` run. Filesystem lookup is kept as a dev/standalone
	// fallback (e.g. `pnpm dev` or library-mode imports).
	if (process.env.ZDOC_VERSION) return process.env.ZDOC_VERSION;
	try {
		const __dirname = fileURLToPath(new URL('.', import.meta.url));
		// Walk up until we find a package.json with @o7z/zdoc — handles both
		// the dev tree (src/routes/...) and any future build layout shift.
		let dir = __dirname;
		for (let i = 0; i < 6; i++) {
			const pkgPath = join(dir, 'package.json');
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
				if (pkg.name === '@o7z/zdoc') return pkg.version;
			} catch {
				/* try parent */
			}
			dir = join(dir, '..');
		}
	} catch {
		/* fall through */
	}
	return '0.0.0';
}

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
		version: readAppVersion(),
	};
};
