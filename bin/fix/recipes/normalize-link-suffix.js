// zdoc fix recipe — normalize-link-suffix
//
// In a v2 docs site that may render multiple file extensions (.md, .pdf,
// ...) , a link like `[foo](/foo)` is ambiguous — there could be both
// foo.md and foo.pdf in the same directory. v2 requires links to include
// the full file extension. This recipe walks every .md file, finds
// internal-doc links missing a recognized suffix, and either auto-fixes
// (single candidate on disk) or flags for manual review (multiple
// candidates) or skips (no candidate — the link is just broken, handled
// by the internal-link lint rule).
//
// US-003 of v2.0.
import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
// Extensions zdoc routinely renders. Order matters for the "1 candidate"
// resolution: if both foo.md and foo.pdf exist, neither wins and we flag
// for manual review.
const KNOWN_EXTS = ['.md', '.pdf'];
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FENCE_RE = /^\s*(```|~~~)/;
const INLINE_CODE_RE = /`[^`]*`/g;
function isInternalDocLink(href) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href))
        return false; // http:, mailto:, etc.
    if (href.startsWith('#'))
        return false;
    if (href.startsWith('//'))
        return false;
    if (href.startsWith('data:'))
        return false;
    return true;
}
function hasKnownExt(pathOnly) {
    return KNOWN_EXTS.some((ext) => pathOnly.toLowerCase().endsWith(ext));
}
function resolveDocPath(docsDir, fromDir, p) {
    if (!p)
        return null;
    let path = p;
    const docsPrefix = '/' + relative(dirname(docsDir), docsDir).split(sep).join('/') + '/';
    if (path.startsWith(docsPrefix)) {
        path = '/' + path.slice(docsPrefix.length);
    }
    if (path.startsWith('/')) {
        return resolve(docsDir, '.' + path);
    }
    return resolve(fromDir, path);
}
function findCandidates(absBaseNoExt) {
    const out = [];
    for (const ext of KNOWN_EXTS) {
        const p = absBaseNoExt + ext;
        try {
            if (existsSync(p) && statSync(p).isFile()) {
                out.push({ ext, fullPath: p });
            }
        }
        catch {
            /* skip */
        }
    }
    return out;
}
const recipe = {
    id: 'normalize-link-suffix',
    autoFix: true,
    description: 'Markdown 链接补全 .md / .pdf 后缀(v2 要求完整后缀)',
    detect(scan, sources) {
        const findings = [];
        for (const mdFile of scan.mdFiles) {
            const source = sources.get(mdFile);
            if (source === undefined)
                continue;
            const lines = source.split(/\r?\n/);
            let inFence = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (FENCE_RE.test(line)) {
                    inFence = !inFence;
                    continue;
                }
                if (inFence)
                    continue;
                const stripped = line.replace(INLINE_CODE_RE, '');
                let m;
                LINK_RE.lastIndex = 0;
                while ((m = LINK_RE.exec(stripped)) !== null) {
                    const href = m[2];
                    if (!isInternalDocLink(href))
                        continue;
                    const [pathOnly, anchor] = href.split('#');
                    if (!pathOnly)
                        continue; // pure anchor
                    if (hasKnownExt(pathOnly))
                        continue; // already explicit
                    // Resolve to the absolute path on disk without extension
                    const absBase = resolveDocPath(scan.docsDir, dirname(mdFile), pathOnly);
                    if (!absBase)
                        continue;
                    const cands = findCandidates(absBase);
                    if (cands.length === 0)
                        continue; // broken — internal-link lint handles it
                    if (cands.length === 1) {
                        const newPath = pathOnly + cands[0].ext + (anchor !== undefined ? '#' + anchor : '');
                        findings.push({
                            recipeId: recipe.id,
                            file: mdFile,
                            message: `第 ${i + 1} 行链接 \`${href}\` 缺后缀,补全为 \`${newPath}\``,
                            payload: { mdFile, rawLink: href, suggested: newPath },
                        });
                    }
                    else {
                        // Multiple candidates (e.g. foo.md AND foo.pdf both exist)
                        const candList = cands.map((c) => pathOnly + c.ext).join(', ');
                        findings.push({
                            recipeId: recipe.id,
                            file: mdFile,
                            message: `第 ${i + 1} 行链接 \`${href}\` 同名 ${cands.length} 候选 (${candList}),请人工选择`,
                            manualReview: true,
                            payload: { mdFile, rawLink: href, suggested: '' },
                        });
                    }
                }
            }
        }
        return findings;
    },
    apply(finding, before) {
        const { rawLink, suggested } = finding.payload;
        if (!suggested)
            return before; // manualReview — should never reach here
        // Replace the FIRST occurrence of `](rawLink)` to avoid touching
        // re-occurrences with the same href elsewhere in the document.
        // Patterns scoped to the `](...)` delimiter avoid matching naked
        // occurrences of the href in text.
        const needle = '](' + rawLink + ')';
        const idx = before.indexOf(needle);
        if (idx === -1)
            return before; // link no longer present (already applied?)
        const replacement = '](' + suggested + ')';
        return before.slice(0, idx) + replacement + before.slice(idx + needle.length);
    },
};
export default recipe;
