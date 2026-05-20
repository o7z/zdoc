// zdoc fix recipe — register-orphan
//
// For every directory that has a _meta.yaml, surface entries that exist on
// disk but are NOT registered:
//
//   - file orphans: a `<name>.md` that exists but is missing from the
//     parent's pages: map (v1) or children: list (v2).
//   - subdir orphans (v2 only): a subdirectory that has its own _meta.yaml
//     but is missing from the parent's children: list. v1 pages-schema
//     parents do NOT trigger subdir orphans — those rely on v1's
//     self-discovery (and adding a subdir as a pages: key is the well-known
//     footgun that lint warns about; see lintMetaSubdirAsFile).
//
// US-005 (v1.15, file-only) + US-004 of v1.17 (subdir extension).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';
// ---------------------------------------------------------------------------
// H1 extraction
// ---------------------------------------------------------------------------
/**
 * Read the first ~30 lines of a .md file, skip YAML frontmatter, and return
 * the text of the first `# Heading` line. Returns null when none is found.
 */
function extractH1(mdPath) {
    let raw;
    try {
        raw = readFileSync(mdPath, 'utf-8');
    }
    catch {
        return null;
    }
    const lines = raw.split('\n').slice(0, 30);
    let i = 0;
    // Skip frontmatter: starts with '---', ends at next '---'
    if (lines[0]?.trimEnd() === '---') {
        i = 1;
        while (i < lines.length && lines[i]?.trimEnd() !== '---')
            i++;
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
// Helpers
// ---------------------------------------------------------------------------
function parentSchema(meta) {
    // children: schema wins when present (v2 direction). When neither is
    // present, treat as pages-schema (legacy default — recipes that add to
    // pages won't break v1 docs).
    if (meta?.children !== undefined)
        return 'children';
    return 'pages';
}
function registeredNames(meta) {
    const names = new Set();
    if (meta?.pages)
        for (const k of Object.keys(meta.pages))
            names.add(k);
    if (meta?.children)
        for (const c of meta.children)
            names.add(c.name);
    return names;
}
// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------
const recipe = {
    id: 'register-orphan',
    autoFix: true,
    description: '把孤儿 .md 自动登记到父级 _meta.yaml；children schema 下也补登未登记子目录',
    detect(scan, sources) {
        const findings = [];
        for (const metaPath of scan.metaFiles) {
            const source = sources.get(metaPath);
            if (!source)
                continue;
            const meta = parseDirMetaFromString(source);
            if (!meta)
                continue;
            const dir = dirname(metaPath);
            const taken = registeredNames(meta);
            const schema = parentSchema(meta);
            // Enumerate directory contents
            let entries;
            try {
                entries = readdirSync(dir);
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                const fullPath = join(dir, entry);
                // --- File orphans ---
                if (entry.endsWith('.md')) {
                    // Whitelist: index.md (landing page) and README.md
                    if (entry === 'index.md' || entry === 'README.md')
                        continue;
                    // Verify it's in the scan's mdFiles set
                    if (!scan.mdFiles.has(fullPath))
                        continue;
                    const orphanKey = basename(entry, '.md');
                    if (taken.has(orphanKey))
                        continue;
                    const h1 = extractH1(fullPath);
                    const derivedTitle = h1 ?? orphanKey;
                    findings.push({
                        recipeId: recipe.id,
                        file: metaPath,
                        message: `"${entry}" 存在但未在 _meta.yaml 中登记（孤儿）`,
                        payload: { entryType: 'file', orphanKey, derivedTitle },
                    });
                    continue;
                }
                // --- Subdir orphans (children schema only) ---
                if (schema !== 'children')
                    continue;
                let isDir = false;
                try {
                    isDir = statSync(fullPath).isDirectory();
                }
                catch {
                    continue;
                }
                if (!isDir)
                    continue;
                if (entry.startsWith('.'))
                    continue;
                // Subdir must have its own _meta.yaml — otherwise it's not a
                // "registered docs subdir" yet (lint's meta-yaml-missing rule
                // catches that separately).
                const subMeta = join(fullPath, '_meta.yaml');
                if (!existsSync(subMeta))
                    continue;
                if (taken.has(entry))
                    continue;
                findings.push({
                    recipeId: recipe.id,
                    file: metaPath,
                    message: `子目录 "${entry}/" 有 _meta.yaml 但未在父级 children: 中登记`,
                    payload: { entryType: 'subdir', orphanKey: entry },
                });
            }
        }
        return findings;
    },
    apply(finding, before) {
        const meta = parseDirMetaFromString(before);
        if (!meta)
            return before;
        const { entryType, orphanKey, derivedTitle } = finding.payload;
        const schema = parentSchema(meta);
        // children-schema parent: always append to children list
        if (schema === 'children') {
            if (!meta.children)
                meta.children = [];
            // Idempotency
            if (meta.children.some((c) => c.name === orphanKey))
                return dumpDirMeta(meta);
            if (entryType === 'subdir') {
                meta.children.push({ name: orphanKey });
            }
            else {
                meta.children.push({ name: orphanKey, title: derivedTitle ?? orphanKey });
            }
            return dumpDirMeta(meta);
        }
        // pages-schema parent: only file orphans land here (subdir orphans
        // don't generate findings under pages-schema, see detect()).
        if (entryType !== 'file')
            return dumpDirMeta(meta); // safety no-op
        if (!meta.pages)
            meta.pages = {};
        if (meta.pages[orphanKey] !== undefined)
            return dumpDirMeta(meta);
        meta.pages[orphanKey] = { title: derivedTitle ?? orphanKey };
        return dumpDirMeta(meta);
    },
};
export default recipe;
