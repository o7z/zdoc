// zdoc fix — recipe: prune-missing-page
//
// READ-ONLY detection recipe. For each _meta.yaml, inspects every key in its
// `pages` map and emits a Finding when the corresponding file does not exist
// on disk. No apply() function — autoFix: false causes the engine to mark all
// findings as manualReview: true automatically.
//
// US-009

import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readDirMeta } from '../../meta-mini.js';
import type { Recipe, Finding, DocsScan } from '../types.js';

export interface PruneMissingPagePayload {
	key: string;           // the pages key that is missing
	expectedPath: string;  // absolute path that was expected to exist
}

const recipe: Recipe<PruneMissingPagePayload> = {
	id: 'prune-missing-page',
	autoFix: false,
	description: '列出 pages 指向的不存在文件（仅提示，不自动修）',

	detect(scan: DocsScan, _sources: Map<string, string>): Finding<PruneMissingPagePayload>[] {
		const findings: Finding<PruneMissingPagePayload>[] = [];

		for (const metaPath of scan.metaFiles) {
			const dm = readDirMeta(metaPath);
			if (!dm?.pages) continue;

			const dir = dirname(metaPath);

			for (const key of Object.keys(dm.pages)) {
				const fileName = key.endsWith('.pdf') ? key : `${key}.md`;
				const expectedPath = join(dir, fileName);

				// If the key resolves to a subdirectory, skip — that is a different
				// footgun covered by the remove-subdir-as-file recipe.
				const subdirPath = join(dir, key);
				if (existsSync(subdirPath) && statSync(subdirPath).isDirectory()) {
					continue;
				}

				if (!existsSync(expectedPath) || !statSync(expectedPath).isFile()) {
					findings.push({
						recipeId: 'prune-missing-page',
						file: metaPath,
						message: `pages 列出 "${key}" 但 ${fileName} 不存在`,
						payload: { key, expectedPath },
					});
				}
			}
		}

		return findings;
	},

	// No apply() — this recipe is intentionally read-only.
};

export default recipe;
