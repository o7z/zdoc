// zdoc fix recipe — normalize-frontmatter-keys
//
// Rename known-typo field names in _meta.yaml entries to the canonical
// PageMeta field name. Skip when the canonical name is already present
// (avoids overwriting deliberate values). Paired with the lint rule
// meta-frontmatter-typo.
//
// US-005 of v2.0.
import { parseDirMetaFromString, dumpDirMeta } from '../yaml-io.js';
import { parseYaml } from '../../meta-mini.js';
// Keep this in sync with FRONTMATTER_TYPO_MAP in bin/lint.ts.
const TYPO_MAP = {
    desc: 'description',
    descripton: 'description',
    discription: 'description',
    modifed: 'modified',
    modifyed: 'modified',
    modify: 'modified',
    autor: 'author',
    auther: 'author',
    lifestyle: 'lifecycle',
    lifecyle: 'lifecycle',
    visablity: 'visibility',
    visiblity: 'visibility',
    supersede_by: 'superseded_by',
    superceded_by: 'superseded_by',
    folded: 'folded_to',
    folded_too: 'folded_to',
};
function collectTypos(raw, locs, scope, key, idx) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return;
    const r = raw;
    for (const k of Object.keys(r)) {
        const corrected = TYPO_MAP[k];
        if (!corrected)
            continue;
        if (corrected in r)
            continue; // canonical already present — skip
        locs.push({ scope, key, childIdx: idx, from: k, to: corrected });
    }
}
const recipe = {
    id: 'normalize-frontmatter-keys',
    autoFix: true,
    description: '修正 _meta.yaml 中已知拼写错位的字段名 (desc → description 等)',
    detect(scan, sources) {
        const findings = [];
        for (const metaPath of scan.metaFiles) {
            const source = sources.get(metaPath);
            if (!source)
                continue;
            let parsed;
            try {
                parsed = parseYaml(source);
            }
            catch {
                continue;
            }
            const locs = [];
            collectTypos(parsed, locs, 'top');
            const pages = parsed.pages;
            if (pages && typeof pages === 'object' && !Array.isArray(pages)) {
                for (const [k, v] of Object.entries(pages)) {
                    collectTypos(v, locs, 'page', k);
                }
            }
            const children = parsed.children;
            if (Array.isArray(children)) {
                children.forEach((item, idx) => {
                    collectTypos(item, locs, 'child', undefined, idx);
                });
            }
            if (locs.length > 0) {
                const summary = locs.map((l) => `${l.from} → ${l.to}`).join(', ');
                findings.push({
                    recipeId: recipe.id,
                    file: metaPath,
                    message: `字段名拼写错位 (${summary})`,
                    payload: {},
                });
            }
        }
        return findings;
    },
    apply(finding, before) {
        // Re-parse the source to get the current model, then rename keys.
        const dm = parseDirMetaFromString(before);
        if (!dm)
            return before;
        // Also re-collect typos against the raw YAML so we know which keys
        // to remap on dm. parseDirMetaFromString already drops unknown keys
        // (coercePageMeta filter), so typo'd keys are NOT preserved through
        // parse. We need to extract them from the raw YAML and apply on dm.
        let raw;
        try {
            raw = parseYaml(before);
        }
        catch {
            return before;
        }
        function applyAt(obj, target) {
            for (const k of Object.keys(obj)) {
                const corrected = TYPO_MAP[k];
                if (!corrected)
                    continue;
                // Canonical already has a real value? (coerce sets all known fields
                // to undefined when missing, so `in target` is too loose — check
                // for an actual non-undefined value).
                if (target[corrected] !== undefined)
                    continue;
                // Copy the raw value onto target as the canonical field
                if (typeof obj[k] === 'string') {
                    target[corrected] = obj[k];
                }
                else if (typeof obj[k] === 'number') {
                    target[corrected] = obj[k];
                }
                // Remove the typo'd key from target if it leaked through
                delete target[k];
            }
        }
        applyAt(raw, dm);
        const pagesRaw = raw.pages;
        if (pagesRaw && typeof pagesRaw === 'object' && !Array.isArray(pagesRaw) && dm.pages) {
            for (const [k, v] of Object.entries(pagesRaw)) {
                const target = dm.pages[k];
                if (target && v && typeof v === 'object' && !Array.isArray(v)) {
                    applyAt(v, target);
                }
            }
        }
        const childrenRaw = raw.children;
        if (Array.isArray(childrenRaw) && dm.children) {
            childrenRaw.forEach((item, idx) => {
                const target = dm.children[idx];
                if (target && item && typeof item === 'object' && !Array.isArray(item)) {
                    applyAt(item, target);
                }
            });
        }
        return dumpDirMeta(dm);
    },
};
export default recipe;
