// zdoc fix — engine.
//
// scan(docsDir, opts):
//   1. walk docsDir → collect every _meta.yaml and every .md file
//   2. read each _meta.yaml, capture source + sha256 (used later to detect
//      out-of-band edits between scan and apply)
//   3. run every registered recipe's detect() and accumulate findings
//   4. optionally filter findings to a single --recipe id
//
// apply(scanResult, opts):
//   1. group findings by file
//   2. for each file: re-read, recompute sha256, abort that file if it
//      drifted since scan
//   3. otherwise: thread source through each finding's recipe.apply() in
//      registration order
//   4. write via tmp file + rename for atomicity; cleanup tmp on error
//
// US-001 ships with an empty RECIPES array — later stories push to it.
import { readdirSync, readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from './yaml-io.js';
import scaffoldMetaYaml from './recipes/scaffold-meta-yaml.js';
import registerOrphan from './recipes/register-orphan.js';
import removeSubdirAsFile from './recipes/remove-subdir-as-file.js';
import deriveMissingTitle from './recipes/derive-missing-title.js';
import envToVisibility from './recipes/env-to-visibility.js';
import pagesToChildren from './recipes/pages-to-children.js';
import pruneMissingPage from './recipes/prune-missing-page.js';
// Compile-time recipe registry. Order matters for apply() — findings are
// processed in the registration order, threading source through each
// recipe.apply(). Rationale for this order:
//   1. scaffold-meta-yaml    — creates new _meta.yaml files (no overlap with others)
//   2. register-orphan       — adds entries to existing pages/children
//   3. remove-subdir-as-file — removes bad entries (footguns)
//   4. derive-missing-title  — fills in titles
//   5. env-to-visibility     — renames env: → visibility: BEFORE pages move to children,
//                              so the rename happens once at the original location
//   6. pages-to-children     — translates pages: map → children: list (v2 schema)
//   7. prune-missing-page    — read-only (autoFix: false), engine auto-flags as manualReview
export const RECIPES = [
    scaffoldMetaYaml,
    registerOrphan,
    removeSubdirAsFile,
    deriveMissingTitle,
    envToVisibility,
    pagesToChildren,
    pruneMissingPage,
];
function walkDocs(docsDir) {
    const dirs = [];
    const mds = [];
    function visit(dir) {
        dirs.push(dir);
        const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
        for (const e of entries) {
            const p = join(dir, e.name);
            if (e.isDirectory())
                visit(p);
            else if (e.isFile() && e.name.endsWith('.md'))
                mds.push(p);
        }
    }
    visit(docsDir);
    return { dirs, mds };
}
function scanFs(docsDir) {
    const { dirs, mds } = walkDocs(docsDir);
    const metaFiles = [];
    const sources = new Map();
    const shas = new Map();
    for (const d of dirs) {
        const meta = join(d, '_meta.yaml');
        if (existsSync(meta)) {
            metaFiles.push(meta);
            const source = readFileSync(meta, 'utf-8');
            sources.set(meta, source);
            shas.set(meta, sha256Hex(source));
        }
    }
    const scan = {
        docsDir,
        metaFiles,
        mdFiles: new Set(mds),
    };
    return { scan, sources, shas };
}
export function scan(docsDir, opts = {}) {
    const { scan: docsScan, sources, shas } = scanFs(docsDir);
    const findings = [];
    for (const recipe of RECIPES) {
        if (opts.recipeId && recipe.id !== opts.recipeId)
            continue;
        const recipeFindings = recipe.detect(docsScan, sources);
        // Mark non-autoFix recipes' findings as manual-review so apply() skips them
        for (const f of recipeFindings) {
            if (!recipe.autoFix && f.manualReview === undefined)
                f.manualReview = true;
        }
        findings.push(...recipeFindings);
    }
    return { scan: docsScan, findings, sourceShas: shas, sources };
}
export function applyToString(result) {
    const previews = new Map();
    const byFile = new Map();
    for (const f of result.findings) {
        if (f.manualReview)
            continue;
        const arr = byFile.get(f.file) ?? [];
        arr.push(f);
        byFile.set(f.file, arr);
    }
    const recipesById = new Map();
    for (const r of RECIPES)
        recipesById.set(r.id, r);
    for (const [file, findings] of byFile) {
        const isNewFile = findings.some((f) => f.payload?.isNewFile === true);
        const before = isNewFile ? '' : (result.sources.get(file) ?? '');
        // Sort findings by registration order
        const sorted = [...findings].sort((a, b) => {
            const ai = RECIPES.findIndex((r) => r.id === a.recipeId);
            const bi = RECIPES.findIndex((r) => r.id === b.recipeId);
            return ai - bi;
        });
        let next = before;
        const recipeIds = [];
        let failedReason;
        for (const f of sorted) {
            const recipe = recipesById.get(f.recipeId);
            if (!recipe || !recipe.apply) {
                failedReason = `recipe ${f.recipeId} 缺少 apply()`;
                break;
            }
            try {
                next = recipe.apply(f, next);
                recipeIds.push(f.recipeId);
            }
            catch (err) {
                failedReason = `recipe ${f.recipeId} 执行失败: ${err.message}`;
                break;
            }
        }
        previews.set(file, { before, after: next, recipeIds, isNewFile, failedReason });
    }
    return previews;
}
// Apply all findings (except manualReview ones). The engine groups by file
// so each file is read/written exactly once even when multiple recipes
// target it.
export function apply(result) {
    const written = [];
    const failed = [];
    // Group findings by file, preserving registration order via recipe lookup
    const byFile = new Map();
    for (const f of result.findings) {
        if (f.manualReview)
            continue;
        const arr = byFile.get(f.file) ?? [];
        arr.push(f);
        byFile.set(f.file, arr);
    }
    // Lookup map: recipeId → recipe
    const recipesById = new Map();
    for (const r of RECIPES)
        recipesById.set(r.id, r);
    // Stable order: process files in the order their first finding appears
    for (const [file, findings] of byFile) {
        // Detect whether this is a new-file creation (e.g. scaffold-meta-yaml).
        // A finding signals this via payload.isNewFile === true. All findings for
        // the same file must agree — if any one is isNewFile the whole group is.
        const isNewFile = findings.some((f) => f.payload?.isNewFile === true);
        let currentSource;
        if (isNewFile) {
            // New file: no SHA to verify. But guard against a race where the file
            // appeared on disk between scan and apply — refuse to overwrite.
            if (existsSync(file)) {
                failed.push({ file, reason: '在 scan 与 apply 之间 _meta.yaml 已被创建，跳过 scaffold' });
                continue;
            }
            currentSource = '';
        }
        else {
            const scanSha = result.sourceShas.get(file);
            if (!scanSha) {
                failed.push({ file, reason: '内部错误：scan 阶段未记录 sha' });
                continue;
            }
            if (!existsSync(file)) {
                failed.push({ file, reason: '文件已不存在（在 scan 与 apply 之间被删除）' });
                continue;
            }
            currentSource = readFileSync(file, 'utf-8');
            const currentSha = sha256Hex(currentSource);
            if (currentSha !== scanSha) {
                failed.push({ file, reason: '文件在 scan 与 apply 之间被外部修改（sha 不匹配），已跳过' });
                continue;
            }
        }
        // Sort findings by registration order (spread to avoid mutating shared arrays)
        const sorted = [...findings].sort((a, b) => {
            const ai = RECIPES.findIndex((r) => r.id === a.recipeId);
            const bi = RECIPES.findIndex((r) => r.id === b.recipeId);
            return ai - bi;
        });
        let next = currentSource;
        const recipeIds = [];
        let failedThisFile = false;
        for (const f of sorted) {
            const recipe = recipesById.get(f.recipeId);
            if (!recipe || !recipe.apply) {
                failed.push({ file, reason: `recipe ${f.recipeId} 缺少 apply()` });
                failedThisFile = true;
                break;
            }
            try {
                next = recipe.apply(f, next);
                recipeIds.push(f.recipeId);
            }
            catch (err) {
                failed.push({ file, reason: `recipe ${f.recipeId} 执行失败: ${err.message}` });
                failedThisFile = true;
                break;
            }
        }
        if (failedThisFile)
            continue;
        if (next === currentSource) {
            // No-op rewrite — don't bother touching the file
            continue;
        }
        // Atomic write: temp file + rename. Cleanup on any failure.
        const tmp = `${file}.tmp.${randomBytes(6).toString('hex')}`;
        try {
            writeFileSync(tmp, next, 'utf-8');
            renameSync(tmp, file);
            written.push({ file, recipeIds });
        }
        catch (err) {
            try {
                if (existsSync(tmp))
                    unlinkSync(tmp);
            }
            catch {
                /* swallow cleanup error — primary failure already recorded */
            }
            failed.push({ file, reason: `写入失败: ${err.message}` });
        }
    }
    return { written, failed };
}
// Helper exported for CLI: validate a --recipe id against registered IDs.
// Returns true if id is registered, false otherwise. Note: for US-001 the
// RECIPES array is empty, so the CLI also accepts the five PLANNED ids
// (see fix.ts PLANNED_RECIPE_IDS) so users can type the flag today without
// it being rejected — the run will simply find no matching findings.
export function isRegisteredRecipeId(id) {
    return RECIPES.some((r) => r.id === id);
}
// Utility for tests: re-export dirname so test fixtures can use the same
// path conventions without pulling node:path. Kept tiny.
export { dirname as _dirname };
