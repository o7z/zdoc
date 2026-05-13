// zdoc fix recipe — remove-subdir-as-file
//
// Detects pages: keys in _meta.yaml where the key name corresponds to a
// subdirectory on disk (foo/) rather than a .md file (foo.md). This is the
// auto-fixer companion to the lint rule lintMetaSubdirAsFile (US-004).
//
// US-006

import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Recipe, DocsScan, Finding } from '../types.js';
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';

interface Payload {
	key: string; // the offending pages: key to remove
}

const recipe: Recipe<Payload> = {
	id: 'remove-subdir-as-file',
	autoFix: true,
	description: '删除把子目录误写成 page key 的条目',

	detect(scan: DocsScan, sources: Map<string, string>): Finding<Payload>[] {
		const findings: Finding<Payload>[] = [];

		for (const metaFile of scan.metaFiles) {
			const source = sources.get(metaFile);
			if (!source) continue;

			const dm = parseDirMetaFromString(source);
			if (!dm?.pages) continue;

			const dir = dirname(metaFile);

			for (const key of Object.keys(dm.pages)) {
				if (key.endsWith('.pdf')) continue;

				const mdPath = join(dir, key + '.md');
				const subdirPath = join(dir, key);

				const mdExists = existsSync(mdPath) && statSync(mdPath).isFile();
				const subdirExists = existsSync(subdirPath) && statSync(subdirPath).isDirectory();

				// Emit only when subdir exists AND .md does NOT exist
				if (!mdExists && subdirExists) {
					findings.push({
						recipeId: recipe.id,
						file: metaFile,
						message: `pages 中 "${key}" 实际指向子目录而非 ${key}.md，已删除此 key`,
						payload: { key },
					});
				}
			}
		}

		return findings;
	},

	apply(finding: Finding<Payload>, before: string): string {
		const dm = parseDirMetaFromString(before);
		if (!dm) return before; // parse failure — leave source unchanged

		const key = finding.payload!.key;

		if (!dm.pages || !(key in dm.pages)) {
			// Key already absent (e.g. deleted by an earlier apply in the same chain)
			return before;
		}

		delete dm.pages[key];

		return dumpDirMeta(dm);
	},
};

export default recipe;
