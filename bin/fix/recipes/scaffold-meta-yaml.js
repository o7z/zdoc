// zdoc fix recipe — scaffold-meta-yaml
//
// For each directory that contains at least one .md file but has NO _meta.yaml,
// generate a new _meta.yaml with:
//   - title: directory basename (verbatim — no case conversion; matches existing
//     repo convention where title reflects intent, not a transformed basename)
//   - pages: one entry per .md file in the directory, in lexicographic order,
//     EXCLUDING index.md (whitelisted as implicit landing page by the lint rule)
//   - Each page title: derived from the first H1 heading, falling back to
//     basename without .md extension
//
// docsDir root is SKIPPED (it is special; lint rule also skips it).
//
// NEW FILE handling: Finding.payload.isNewFile = true signals to the engine
// that no pre-existing file content exists. The engine must bypass its SHA
// check for these findings and pass '' as the before-string to apply().
// See engine.ts for the implementation.
//
// US-008
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { dumpDirMeta } from '../yaml-io.js';
// ---------------------------------------------------------------------------
// H1 extraction (mirrors derive-missing-title.ts logic)
// ---------------------------------------------------------------------------
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
    id: 'scaffold-meta-yaml',
    autoFix: true,
    description: '为只有 .md 但缺 _meta.yaml 的目录生成 _meta.yaml',
    detect(scan, _sources) {
        const findings = [];
        // Walk every directory that the engine's walkDocs discovered via mdFiles.
        // We derive the set of directories from mdFiles + metaFiles rather than
        // requiring a dirs array on DocsScan (which doesn't exist in the type).
        const allDirs = new Set();
        for (const mdPath of scan.mdFiles) {
            // parent dir of each .md file
            const dir = join(mdPath, '..');
            allDirs.add(dir);
        }
        // Also include dirs that have a _meta.yaml (they're not missing one, but
        // we need them in scope to correctly skip the docsDir root check).
        for (const metaPath of scan.metaFiles) {
            const dir = join(metaPath, '..');
            allDirs.add(dir);
        }
        for (const dir of allDirs) {
            // Skip docsDir root — it is special (lint rule also skips it)
            if (dir === scan.docsDir)
                continue;
            // Skip if _meta.yaml already exists for this dir
            const metaPath = join(dir, '_meta.yaml');
            if (scan.metaFiles.includes(metaPath))
                continue;
            // Check if this dir has at least one .md file directly inside it
            // (not from subdirectories — we check direct children only)
            const directMds = [...scan.mdFiles].filter((f) => join(f, '..') === dir);
            if (directMds.length === 0)
                continue;
            findings.push({
                recipeId: recipe.id,
                file: metaPath,
                message: `目录 "${basename(dir)}" 有 .md 文件但缺少 _meta.yaml，将生成`,
                payload: {
                    dirPath: dir,
                    isNewFile: true,
                },
            });
        }
        return findings;
    },
    apply(finding, _before) {
        // _before is '' for new files — we ignore it entirely and build from scratch.
        const { dirPath } = finding.payload;
        // Title: directory basename verbatim (no case conversion)
        const title = basename(dirPath);
        // Collect .md files directly in this directory, lexicographic order
        let entries;
        try {
            entries = readdirSync(dirPath, { withFileTypes: true })
                .filter((e) => e.isFile() && e.name.endsWith('.md'))
                .map((e) => e.name)
                .sort();
        }
        catch {
            entries = [];
        }
        // Build pages map: exclude index.md (whitelisted landing page)
        const pages = {};
        for (const fileName of entries) {
            if (fileName === 'index.md')
                continue; // whitelisted, skip
            const slug = fileName.slice(0, -3); // strip .md
            const mdPath = join(dirPath, fileName);
            const h1 = extractH1(mdPath);
            const pageTitle = h1 ?? slug;
            pages[slug] = { title: pageTitle };
        }
        const meta = { title };
        if (Object.keys(pages).length > 0) {
            meta.pages = pages;
        }
        return dumpDirMeta(meta);
    },
};
export default recipe;
