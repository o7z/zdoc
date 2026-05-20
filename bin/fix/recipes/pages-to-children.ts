// zdoc fix recipe — pages-to-children
//
// Mechanical v2 schema migration: translate the legacy `pages:` map into a
// `children:` list. See docs/dev/next-major.md "已决定" → schema.
//
// Behavior:
//   1. Stable-sort pages entries by (order ?? 999, key alphabetical).
//   2. Convert each page entry to a children item, dropping the `order:`
//      field (v2 removes it — array position is the order).
//   3. Append children for any self-discovered subdirs (subdir/_meta.yaml
//      exists, name not yet in children/pages) — this preserves their
//      sidebar visibility once v2 cuts off self-discovery (US-003 of v1.16).
//   4. Remove the `pages:` field entirely.
//
// Pairs with the meta-legacy-schema lint warning (landed in v1.16).
// Recipe is order-aware against env-to-visibility: env-to-visibility should
// run FIRST so env fields inside pages entries get renamed before the
// pages-to-children translation copies them across. The engine RECIPES
// array enforces this ordering.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Recipe, Finding, DocsScan, DirMeta, ChildEntry } from '../types.js';
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';

// Two distinct migration cases (set at scan time, doesn't change):
//   'pages-migration' — _meta.yaml has pages: at scan time; do full pages →
//     children translation + drop pages + append subdirs.
//   'subdir-only' — no pages at scan time, but self-discovered subdirs need
//     explicit registration before v2 cuts off self-discovery. Only append
//     subdirs to children; do NOT delete or touch pages (in case a later
//     recipe like register-orphan adds pages entries in the same apply pass —
//     we leave those alone for the user to migrate later).
interface Payload {
	caseType: 'pages-migration' | 'subdir-only';
}

/**
 * List subdirectories with their own _meta.yaml, returning each subdir
 * with its `order:` from its own _meta.yaml (the v1 self-discovery sort
 * key). Used by apply() to merge subdirs and pages: entries into a single
 * sort pass so the migrated children list matches v1's sidebar order.
 */
interface SubdirWithOrder {
	name: string;
	order: number;
}

function listSubdirsWithMeta(dir: string): SubdirWithOrder[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
			.map((e) => e.name)
			.filter((name) => existsSync(join(dir, name, '_meta.yaml')))
			.map((name) => {
				let order = 999;
				try {
					const subMeta = parseDirMetaFromString(
						readFileSync(join(dir, name, '_meta.yaml'), 'utf-8'),
					);
					if (typeof subMeta?.order === 'number') order = subMeta.order;
				} catch {
					/* keep default order */
				}
				return { name, order };
			})
			.sort((a, b) => {
				if (a.order !== b.order) return a.order - b.order;
				return a.name.localeCompare(b.name);
			});
	} catch {
		return [];
	}
}

const recipe: Recipe<Payload> = {
	id: 'pages-to-children',
	autoFix: true,
	description: '把 pages: map 翻译成 children: list (v2 schema 迁移)',

	detect(scan: DocsScan, sources: Map<string, string>): Finding<Payload>[] {
		const findings: Finding<Payload>[] = [];
		for (const metaPath of scan.metaFiles) {
			const source = sources.get(metaPath);
			if (!source) continue;
			const meta = parseDirMetaFromString(source);
			if (!meta) continue;

			// Case 1: pages: is present (classic v1 schema) → migrate.
			if (meta.pages !== undefined) {
				findings.push({
					recipeId: recipe.id,
					file: metaPath,
					message:
						'pages: 翻译为 children: list（附带自发现子目录的显式登记）',
					payload: { caseType: 'pages-migration' },
				});
				continue;
			}

			// Case 2: no pages, no children, but self-discovered subdirs need
			// explicit registration before v2 cuts off self-discovery. This
			// catches "title-only" parents like docs/guide/_meta.yaml whose
			// child sections come up via self-discovery in v1.
			if (meta.children === undefined) {
				const dir = dirname(metaPath);
				const subdirs = listSubdirsWithMeta(dir);
				if (subdirs.length > 0) {
					findings.push({
						recipeId: recipe.id,
						file: metaPath,
						message: '把自发现的子目录显式登记到 children: list',
						payload: { caseType: 'subdir-only' },
					});
				}
			}
		}
		return findings;
	},

	apply(finding: Finding<Payload>, before: string): string {
		const meta = parseDirMetaFromString(before);
		if (!meta) return before;

		const existingChildren = meta.children ?? [];
		const taken = new Set<string>(existingChildren.map((c) => c.name));
		const dir = dirname(finding.file);
		const caseType = finding.payload?.caseType ?? 'pages-migration';

		// Subdir-only case: append self-discovered subdirs to existing
		// children (preserving original children order); leave pages alone.
		// Another recipe may have added entries to pages during this apply
		// pass — leave them for a future zdoc fix run to explicitly migrate.
		if (caseType === 'subdir-only') {
			const childList: ChildEntry[] = [...existingChildren];
			for (const { name } of listSubdirsWithMeta(dir)) {
				if (taken.has(name)) continue;
				childList.push({ name });
				taken.add(name);
			}
			if (childList.length === 0) return dumpDirMeta(meta);
			const migrated: DirMeta = { ...meta };
			migrated.children = childList;
			return dumpDirMeta(migrated);
		}

		// Pages-migration case: merge pages entries AND self-discovered
		// subdirs into a single sort pass keyed on `order ?? 999` then name
		// (alphabetical). This matches v1 sidebar ordering, which interleaves
		// file entries (from pages:) and subdir entries (from self-discovery)
		// by their order field. After sort we drop the `order:` field from
		// each entry (v2 removes it).
		interface SortCand {
			order: number;
			name: string;
			entry: ChildEntry;
		}
		const cands: SortCand[] = [];

		// pages entries → candidates
		const pagesObj = meta.pages;
		if (pagesObj) {
			for (const [key, pageMeta] of Object.entries(pagesObj)) {
				if (taken.has(key)) continue;
				const order = pageMeta.order ?? 999;
				const { order: _drop, ...rest } = pageMeta;
				cands.push({ order, name: key, entry: { name: key, ...rest } });
				taken.add(key);
			}
		}

		// self-discovered subdir entries → candidates
		for (const sub of listSubdirsWithMeta(dir)) {
			if (taken.has(sub.name)) continue;
			cands.push({ order: sub.order, name: sub.name, entry: { name: sub.name } });
			taken.add(sub.name);
		}

		// Stable-sort by (order, name)
		cands.sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return a.name.localeCompare(b.name);
		});

		// Compose final child list: existing children first (preserve their
		// position), then sorted new candidates.
		const childList: ChildEntry[] = [...existingChildren, ...cands.map((c) => c.entry)];

		const migrated: DirMeta = { ...meta };
		delete migrated.pages;
		migrated.children = childList;
		return dumpDirMeta(migrated);
	},
};

export default recipe;
