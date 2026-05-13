// zdoc fix recipe — derive-missing-title
//
// For every entry under pages: in a _meta.yaml that points to an existing
// .md file but lacks a title: field, derive the title from the first H1
// heading in the .md file (or fall back to the basename without extension).
//
// US-007

import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { dirname } from 'node:path';
import type { Recipe, Finding, DocsScan } from '../types.js';
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';

// ---------------------------------------------------------------------------
// H1 extraction
// ---------------------------------------------------------------------------

/**
 * Read the first ~30 lines of a .md file, skip YAML frontmatter, and return
 * the text of the first `# Heading` line. Returns null when none is found.
 */
function extractH1(mdPath: string): string | null {
	let raw: string;
	try {
		raw = readFileSync(mdPath, 'utf-8');
	} catch {
		return null;
	}

	const lines = raw.split('\n').slice(0, 30);
	let i = 0;

	// Skip frontmatter: starts with '---', ends at next '---'
	if (lines[0]?.trimEnd() === '---') {
		i = 1;
		while (i < lines.length && lines[i]?.trimEnd() !== '---') i++;
		i++; // skip the closing '---'
	}

	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith('# ')) {
			return line.slice(2).trim();
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Finding payload
// ---------------------------------------------------------------------------

interface DeriveMissingTitlePayload {
	pageKey: string;
	derivedTitle: string;
}

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------

const recipe: Recipe<DeriveMissingTitlePayload> = {
	id: 'derive-missing-title',
	autoFix: true,
	description: '从首个 H1 推导缺失的 title',

	detect(scan: DocsScan, sources: Map<string, string>): Finding<DeriveMissingTitlePayload>[] {
		const findings: Finding<DeriveMissingTitlePayload>[] = [];

		for (const metaPath of scan.metaFiles) {
			const source = sources.get(metaPath);
			if (!source) continue;

			const meta = parseDirMetaFromString(source);
			if (!meta?.pages) continue;

			const dir = dirname(metaPath);

			for (const [pageKey, pageMeta] of Object.entries(meta.pages)) {
				// Skip PDF entries — no H1 to read
				if (pageKey.endsWith('.pdf')) continue;

				// Only emit a finding when title is missing or empty string
				if (pageMeta.title !== undefined && pageMeta.title !== '') continue;

				// Only emit a finding when the .md file actually exists
				const mdPath = join(dir, pageKey + '.md');
				if (!existsSync(mdPath)) continue;

				// Derive title: H1 or basename fallback
				const h1 = extractH1(mdPath);
				const derivedTitle = h1 ?? basename(pageKey);

				findings.push({
					recipeId: recipe.id,
					file: metaPath,
					message: `pages 中 "${pageKey}" 缺少 title，推导为 "${derivedTitle}"`,
					payload: { pageKey, derivedTitle },
				});
			}
		}

		return findings;
	},

	apply(finding: Finding<DeriveMissingTitlePayload>, before: string): string {
		const { pageKey, derivedTitle } = finding.payload!;
		const meta = parseDirMetaFromString(before);
		if (!meta) return before;

		if (!meta.pages) meta.pages = {};
		if (!meta.pages[pageKey]) meta.pages[pageKey] = {};
		meta.pages[pageKey].title = derivedTitle;

		return dumpDirMeta(meta);
	},
};

export default recipe;
