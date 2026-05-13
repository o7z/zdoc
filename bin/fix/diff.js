// zdoc fix — unified diff generator (US-003).
//
// Produces git-style unified diff output (equivalent to `diff -U 3`).
// Algorithm: LCS (longest common subsequence) on lines, O(N²), sufficient
// for short YAML files.
export function unifiedDiff(filePath, before, after) {
    if (before === after)
        return '';
    const beforeLines = splitLines(before);
    const afterLines = splitLines(after);
    const ops = diffLines(beforeLines, afterLines);
    const hunks = buildHunks(ops, 3);
    if (hunks.length === 0)
        return '';
    const beforeNoNl = before.length > 0 && !before.endsWith('\n');
    const afterNoNl = after.length > 0 && !after.endsWith('\n');
    const parts = [];
    parts.push(`--- a/${filePath}\n`);
    parts.push(`+++ b/${filePath}\n`);
    for (const hunk of hunks) {
        parts.push(formatHunk(hunk, beforeLines, afterLines, beforeNoNl, afterNoNl));
    }
    return parts.join('');
}
// ---------------------------------------------------------------------------
// splitLines: keeps trailing newline as part of each line so line content is
// preserved, but for comparison purposes we compare the full line content.
// We split on newlines but treat each logical line as the text before '\n'.
// For diff purposes lines are compared without their newline terminator.
// ---------------------------------------------------------------------------
function splitLines(text) {
    if (text === '')
        return [];
    // Split on \n; if text ends with \n the last element will be '' — drop it.
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '')
        lines.pop();
    return lines;
}
// ---------------------------------------------------------------------------
// LCS-based diff
// ---------------------------------------------------------------------------
function diffLines(before, after) {
    const m = before.length;
    const n = after.length;
    // Build LCS table
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (before[i] === after[j]) {
                dp[i][j] = 1 + dp[i + 1][j + 1];
            }
            else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }
    // Trace back to build ops
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (before[i] === after[j]) {
            ops.push({ kind: 'eq', oldIdx: i, newIdx: j });
            i++;
            j++;
        }
        else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({ kind: 'del', oldIdx: i });
            i++;
        }
        else {
            ops.push({ kind: 'ins', newIdx: j });
            j++;
        }
    }
    while (i < m) {
        ops.push({ kind: 'del', oldIdx: i });
        i++;
    }
    while (j < n) {
        ops.push({ kind: 'ins', newIdx: j });
        j++;
    }
    return ops;
}
// ---------------------------------------------------------------------------
// Build hunks: group changed ops with up to `ctx` lines of context each side.
// Adjacent hunks whose context windows overlap are merged.
// ---------------------------------------------------------------------------
function buildHunks(ops, ctx) {
    // Find indices of changed ops
    const changedIdx = [];
    for (let k = 0; k < ops.length; k++) {
        if (ops[k].kind !== 'eq')
            changedIdx.push(k);
    }
    if (changedIdx.length === 0)
        return [];
    // Build windows [lo, hi] (inclusive, in ops index space) around each change
    const windows = [];
    for (const ci of changedIdx) {
        const lo = Math.max(0, ci - ctx);
        const hi = Math.min(ops.length - 1, ci + ctx);
        windows.push([lo, hi]);
    }
    // Merge overlapping/adjacent windows
    const merged = [windows[0]];
    for (let k = 1; k < windows.length; k++) {
        const last = merged[merged.length - 1];
        if (windows[k][0] <= last[1] + 1) {
            last[1] = Math.max(last[1], windows[k][1]);
        }
        else {
            merged.push(windows[k]);
        }
    }
    // Convert each merged window into a Hunk
    const hunks = [];
    for (const [lo, hi] of merged) {
        const slicedOps = ops.slice(lo, hi + 1);
        // Determine oldStart / newStart (1-based line numbers)
        let oldStart = 1;
        let newStart = 1;
        // Count how many old/new lines come before this window
        for (let k = 0; k < lo; k++) {
            const op = ops[k];
            if (op.kind === 'eq' || op.kind === 'del')
                oldStart++;
            if (op.kind === 'eq' || op.kind === 'ins')
                newStart++;
        }
        hunks.push({ ops: slicedOps, oldStart, newStart });
    }
    return hunks;
}
// ---------------------------------------------------------------------------
// Format a single hunk into string
// ---------------------------------------------------------------------------
function formatHunk(hunk, beforeLines, afterLines, beforeNoNl, afterNoNl) {
    const oldCount = hunk.ops.filter((o) => o.kind === 'eq' || o.kind === 'del').length;
    const newCount = hunk.ops.filter((o) => o.kind === 'eq' || o.kind === 'ins').length;
    const header = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@\n`;
    const lines = [header];
    const lastOldIdx = beforeLines.length - 1;
    const lastNewIdx = afterLines.length - 1;
    for (const op of hunk.ops) {
        if (op.kind === 'eq') {
            lines.push(` ${beforeLines[op.oldIdx]}\n`);
        }
        else if (op.kind === 'del') {
            lines.push(`-${beforeLines[op.oldIdx]}\n`);
            if (beforeNoNl && op.oldIdx === lastOldIdx) {
                lines.push('\\ No newline at end of file\n');
            }
        }
        else {
            lines.push(`+${afterLines[op.newIdx]}\n`);
            if (afterNoNl && op.newIdx === lastNewIdx) {
                lines.push('\\ No newline at end of file\n');
            }
        }
    }
    return lines.join('');
}
