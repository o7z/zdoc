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
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';
function listSubdirsWithMeta(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => e.name)
            .filter((name) => existsSync(join(dir, name, '_meta.yaml')))
            .sort();
    }
    catch {
        return [];
    }
}
const recipe = {
    id: 'pages-to-children',
    autoFix: true,
    description: '把 pages: map 翻译成 children: list (v2 schema 迁移)',
    detect(scan, sources) {
        const findings = [];
        for (const metaPath of scan.metaFiles) {
            const source = sources.get(metaPath);
            if (!source)
                continue;
            const meta = parseDirMetaFromString(source);
            if (!meta)
                continue;
            // Trigger when pages: is present in the parsed model (i.e. user
            // wrote v1 schema). Empty pages map ({}) still triggers — the recipe
            // will simply drop the empty pages key and possibly add subdir
            // entries to children.
            if (meta.pages !== undefined) {
                findings.push({
                    recipeId: recipe.id,
                    file: metaPath,
                    message: 'pages: 翻译为 children: list（附带自发现子目录的显式登记）',
                    payload: {},
                });
            }
        }
        return findings;
    },
    apply(finding, before) {
        const meta = parseDirMetaFromString(before);
        if (!meta)
            return before;
        // If pages is absent (e.g. already migrated), this is a no-op.
        const pagesObj = meta.pages;
        if (pagesObj === undefined)
            return dumpDirMeta(meta);
        // Start from existing children (in case the file is mid-migration).
        const childList = meta.children ? [...meta.children] : [];
        const taken = new Set(childList.map((c) => c.name));
        // Stable-sort pages entries by (order ?? 999, key alphabetical).
        const pageEntries = Object.entries(pagesObj);
        pageEntries.sort(([ak, av], [bk, bv]) => {
            const ao = av.order ?? 999;
            const bo = bv.order ?? 999;
            if (ao !== bo)
                return ao - bo;
            return ak.localeCompare(bk);
        });
        // Convert each page entry to a ChildEntry, dropping `order`.
        for (const [key, pageMeta] of pageEntries) {
            if (taken.has(key))
                continue; // children already won — don't overwrite
            const { order: _drop, ...rest } = pageMeta;
            childList.push({ name: key, ...rest });
            taken.add(key);
        }
        // Append children for self-discovered subdirs (subdir/_meta.yaml exists,
        // name not yet listed). This keeps subdirs visible after v2 cuts off
        // self-discovery (see docs/dev/next-major.md "自发现规则:未登记 = 不显示").
        const dir = dirname(finding.file);
        for (const subdirName of listSubdirsWithMeta(dir)) {
            if (taken.has(subdirName))
                continue;
            childList.push({ name: subdirName });
            taken.add(subdirName);
        }
        // Build the migrated meta: remove pages, set children.
        const migrated = { ...meta };
        delete migrated.pages;
        migrated.children = childList;
        return dumpDirMeta(migrated);
    },
};
export default recipe;
