// zdoc fix recipe — register-orphan
//
// For every directory that has a _meta.yaml, find .md files that exist on
// disk but are NOT listed under pages:. Emit one Finding per orphan so the
// engine can append them to the _meta.yaml automatically.
//
// US-005
import { readdirSync, readFileSync } from 'node:fs';
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
// Recipe
// ---------------------------------------------------------------------------
const recipe = {
    id: 'register-orphan',
    autoFix: true,
    description: '把孤儿 .md 自动登记到父级 _meta.yaml',
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
            // Build set of already-registered keys from pages:
            const registeredKeys = new Set(meta.pages ? Object.keys(meta.pages) : []);
            // List all .md files in this directory (non-recursive)
            let entries;
            try {
                entries = readdirSync(dir);
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                if (!entry.endsWith('.md'))
                    continue;
                const mdPath = join(dir, entry);
                // Exclusion: skip index.md everywhere (root home + subdirs)
                if (entry === 'index.md')
                    continue;
                // Exclusion: skip README.md
                if (entry === 'README.md')
                    continue;
                // Verify it's actually in the scan's mdFiles set
                if (!scan.mdFiles.has(mdPath))
                    continue;
                const orphanKey = basename(entry, '.md');
                // Skip if already registered
                if (registeredKeys.has(orphanKey))
                    continue;
                // Derive title from H1 or fall back to basename
                const h1 = extractH1(mdPath);
                const derivedTitle = h1 ?? orphanKey;
                findings.push({
                    recipeId: recipe.id,
                    file: metaPath,
                    message: `"${entry}" 存在但未在 _meta.yaml 中登记（孤儿）`,
                    payload: { orphanKey, derivedTitle },
                });
            }
        }
        return findings;
    },
    apply(finding, before) {
        const { orphanKey, derivedTitle } = finding.payload;
        const meta = parseDirMetaFromString(before);
        if (!meta)
            return before;
        if (!meta.pages)
            meta.pages = {};
        // Idempotency: if already registered, return as-is
        if (meta.pages[orphanKey] !== undefined)
            return dumpDirMeta(meta);
        // Append new entry at end of pages map
        meta.pages[orphanKey] = { title: derivedTitle };
        return dumpDirMeta(meta);
    },
};
export default recipe;
