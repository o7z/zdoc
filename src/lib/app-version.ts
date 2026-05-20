// Resolves the running zdoc app's version. The version is shown in the
// About modal and exposed by /api/version (future). Two sources, in order:
//
//   1. process.env.ZDOC_VERSION — bin/cli.ts sets this at startup from
//      package.json. This is the canonical path for any real `zdoc` run.
//   2. Walk up from __dirname looking for a package.json with
//      `name: '@o7z/zdoc'`. Handles dev (`pnpm dev`) and library-mode
//      imports where the env var isn't set.
//
// The walk-up is robust to build-layout changes: SvelteKit historically
// emits the server bundle to .svelte-kit/output/server/chunks/<hash>/...
// (so a single ../package.json read fails); a future layout shift would
// silently break the old code, but the walk-up catches it.
//
// Fallback to '0.0.0' is intentional — visibly wrong rather than crashing
// the page render. A test in app-version.test.ts asserts this only fires
// when both sources are unreachable.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION_FALLBACK = '0.0.0' as const;

export function readAppVersion(): string {
	if (process.env.ZDOC_VERSION) return process.env.ZDOC_VERSION;
	try {
		const __dirname = fileURLToPath(new URL('.', import.meta.url));
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
	return VERSION_FALLBACK;
}
