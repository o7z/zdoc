// zdoc fix recipe — env-to-visibility
//
// Mechanical v2 field rename: `env:` → `visibility:`, with value mapping
// `env: prod` → `visibility: prod-only`. Walks every position where the
// field can appear: top-level, pages.*, children[]. Pairs with the
// meta-legacy-env-key lint warning (landed in v1.16).
//
// Behavior:
//   - When a location has env: but NO visibility:, rewrite as
//     visibility: <mapped value>, then delete env:.
//   - When a location has BOTH env: and visibility:, preserve visibility
//     (user-explicit wins) and delete env:.
//   - env: values other than 'prod' are renamed verbatim (env: foo →
//     visibility: foo) — the recipe only renames the field, not values
//     it doesn't understand. The v2 schema only ships visibility:
//     prod-only as the first value (see docs/dev/next-major.md "边界确认"),
//     but unknown values are migrated as-is so users keep their data.

import type { Recipe, Finding, DocsScan } from '../types.js';
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';

type Payload = Record<string, never>;

function mapEnvValue(env: string): string {
	return env === 'prod' ? 'prod-only' : env;
}

const recipe: Recipe<Payload> = {
	id: 'env-to-visibility',
	autoFix: true,
	description: 'env: 字段重命名为 visibility: (v2,env: prod → visibility: prod-only)',

	detect(scan: DocsScan, sources: Map<string, string>): Finding<Payload>[] {
		const findings: Finding<Payload>[] = [];
		for (const metaPath of scan.metaFiles) {
			const source = sources.get(metaPath);
			if (!source) continue;
			const meta = parseDirMetaFromString(source);
			if (!meta) continue;

			let hasEnv = false;
			if (typeof meta.env === 'string') hasEnv = true;
			if (!hasEnv && meta.pages) {
				for (const p of Object.values(meta.pages)) {
					if (typeof p.env === 'string') {
						hasEnv = true;
						break;
					}
				}
			}
			if (!hasEnv && meta.children) {
				for (const c of meta.children) {
					if (typeof c.env === 'string') {
						hasEnv = true;
						break;
					}
				}
			}

			if (hasEnv) {
				findings.push({
					recipeId: recipe.id,
					file: metaPath,
					message: 'env: 字段已重命名为 visibility:（env: prod → visibility: prod-only）',
					payload: {},
				});
			}
		}
		return findings;
	},

	apply(finding: Finding<Payload>, before: string): string {
		const meta = parseDirMetaFromString(before);
		if (!meta) return before;

		// Top-level
		if (typeof meta.env === 'string') {
			if (meta.visibility === undefined) {
				meta.visibility = mapEnvValue(meta.env);
			}
			delete meta.env;
		}

		// pages.*
		if (meta.pages) {
			for (const p of Object.values(meta.pages)) {
				if (typeof p.env === 'string') {
					if (p.visibility === undefined) {
						p.visibility = mapEnvValue(p.env);
					}
					delete p.env;
				}
			}
		}

		// children[]
		if (meta.children) {
			for (const c of meta.children) {
				if (typeof c.env === 'string') {
					if (c.visibility === undefined) {
						c.visibility = mapEnvValue(c.env);
					}
					delete c.env;
				}
			}
		}

		return dumpDirMeta(meta);
	},
};

export default recipe;
