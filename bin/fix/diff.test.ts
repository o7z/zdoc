import { test, expect, describe } from 'bun:test';
import { unifiedDiff } from './diff.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(text: string): string[] {
	return text.split('\n');
}

// ---------------------------------------------------------------------------
// Identical input → empty string
// ---------------------------------------------------------------------------

describe('unifiedDiff — identical input', () => {
	test('identical non-empty → empty string', () => {
		const s = 'line1\nline2\nline3\n';
		expect(unifiedDiff('foo.yaml', s, s)).toBe('');
	});

	test('both empty → empty string', () => {
		expect(unifiedDiff('foo.yaml', '', '')).toBe('');
	});
});

// ---------------------------------------------------------------------------
// Header lines
// ---------------------------------------------------------------------------

describe('unifiedDiff — header', () => {
	test('header uses filePath verbatim', () => {
		const out = unifiedDiff('docs/_meta.yaml', 'a\n', 'b\n');
		expect(out).toContain('--- a/docs/_meta.yaml\n');
		expect(out).toContain('+++ b/docs/_meta.yaml\n');
	});
});

// ---------------------------------------------------------------------------
// Simple line change (1 line modified)
// ---------------------------------------------------------------------------

describe('unifiedDiff — simple modification', () => {
	test('single line change → 1 hunk with context above + below', () => {
		const before = 'alpha\nbeta\ngamma\ndelta\nepsilon\n';
		const after  = 'alpha\nbeta\nGAMMA\ndelta\nepsilon\n';
		const out = unifiedDiff('f.yaml', before, after);
		const ls = lines(out);

		// Exactly one hunk header
		const hunkHeaders = ls.filter((l) => l.startsWith('@@'));
		expect(hunkHeaders.length).toBe(1);

		// Context lines above and below the change
		expect(out).toContain(' beta\n');
		expect(out).toContain(' delta\n');

		// The change itself
		expect(out).toContain('-gamma\n');
		expect(out).toContain('+GAMMA\n');
	});
});

// ---------------------------------------------------------------------------
// Insertions
// ---------------------------------------------------------------------------

describe('unifiedDiff — insertions', () => {
	test('insert at start', () => {
		const before = 'b\nc\n';
		const after  = 'a\nb\nc\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).toContain('+a\n');
		// No deletion lines (header lines starting with --- are not deletion markers)
		expect(out.split('\n').filter((l) => /^-[^-]/.test(l)).length).toBe(0);
		expect(out.split('\n').filter((l) => l.startsWith('@@')).length).toBe(1);
	});

	test('insert in middle', () => {
		const before = 'a\nc\n';
		const after  = 'a\nb\nc\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).toContain('+b\n');
		expect(out).toContain(' a\n');
		expect(out).toContain(' c\n');
	});

	test('insert at end', () => {
		const before = 'a\nb\n';
		const after  = 'a\nb\nc\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).toContain('+c\n');
		expect(out).toContain(' b\n');
	});
});

// ---------------------------------------------------------------------------
// Deletions
// ---------------------------------------------------------------------------

describe('unifiedDiff — deletions', () => {
	test('delete at start', () => {
		const before = 'a\nb\nc\n';
		const after  = 'b\nc\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).toContain('-a\n');
		// No insertion lines (header lines starting with +++ are not insertion markers)
		expect(out.split('\n').filter((l) => /^\+[^+]/.test(l)).length).toBe(0);
	});

	test('delete in middle', () => {
		const before = 'a\nb\nc\n';
		const after  = 'a\nc\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).toContain('-b\n');
		expect(out).toContain(' a\n');
		expect(out).toContain(' c\n');
	});

	test('delete at end', () => {
		const before = 'a\nb\nc\n';
		const after  = 'a\nb\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).toContain('-c\n');
		expect(out).toContain(' b\n');
	});
});

// ---------------------------------------------------------------------------
// Multi-hunk: changes far apart → 2+ hunks
// ---------------------------------------------------------------------------

describe('unifiedDiff — multi-hunk', () => {
	test('two changes 14 lines apart → 2 separate hunks', () => {
		// Build a 20-line file; change line 1 and line 20
		const beforeArr = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
		const afterArr = [...beforeArr];
		afterArr[0] = 'CHANGED_TOP';
		afterArr[19] = 'CHANGED_BOTTOM';

		const before = beforeArr.join('\n') + '\n';
		const after  = afterArr.join('\n') + '\n';

		const out = unifiedDiff('f.yaml', before, after);
		const hunkHeaders = out.split('\n').filter((l) => l.startsWith('@@'));
		expect(hunkHeaders.length).toBe(2);
		expect(out).toContain('-line1\n');
		expect(out).toContain('+CHANGED_TOP\n');
		expect(out).toContain('-line20\n');
		expect(out).toContain('+CHANGED_BOTTOM\n');
	});

	test('two changes 6 lines apart → merged into 1 hunk', () => {
		// 3 ctx above first change + 3 ctx below second change = they touch
		const beforeArr = Array.from({ length: 12 }, (_, i) => `line${i + 1}`);
		const afterArr = [...beforeArr];
		afterArr[1] = 'CHANGED_A'; // line 2
		afterArr[7] = 'CHANGED_B'; // line 8 — gap between changes = lines 3,4,5,6,7 = 5 lines < 2*ctx=6
		const before = beforeArr.join('\n') + '\n';
		const after  = afterArr.join('\n') + '\n';

		const out = unifiedDiff('f.yaml', before, after);
		const hunkHeaders = out.split('\n').filter((l) => l.startsWith('@@'));
		expect(hunkHeaders.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Empty file cases
// ---------------------------------------------------------------------------

describe('unifiedDiff — empty file cases', () => {
	test('empty → content (all additions)', () => {
		const out = unifiedDiff('f.yaml', '', 'a\nb\n');
		expect(out).toContain('+a\n');
		expect(out).toContain('+b\n');
		// No deletion lines (header --- is not a deletion marker)
		expect(out.split('\n').filter((l) => /^-[^-]/.test(l)).length).toBe(0);
	});

	test('content → empty (all deletions)', () => {
		const out = unifiedDiff('f.yaml', 'a\nb\n', '');
		expect(out).toContain('-a\n');
		expect(out).toContain('-b\n');
		// No insertion lines (header +++ is not an insertion marker)
		expect(out.split('\n').filter((l) => /^\+[^+]/.test(l)).length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Trailing-newline handling
// ---------------------------------------------------------------------------

describe('unifiedDiff — trailing newline', () => {
	test('before ends with newline, after does not → no-newline marker on last + line', () => {
		const before = 'a\nb\n';
		const after  = 'a\nB'; // no trailing newline
		const out = unifiedDiff('f.yaml', before, after);
		// The marker must appear after the +B line
		const idx = out.indexOf('+B\n');
		expect(idx).toBeGreaterThan(-1);
		const afterPlusB = out.slice(idx + 3);
		expect(afterPlusB.startsWith('\\ No newline at end of file\n')).toBe(true);
		// Should NOT appear after the -b deletion
		expect(out).not.toContain('-b\n\\ No newline');
	});

	test('after ends with newline, before does not → no-newline marker on last - line', () => {
		const before = 'a\nb'; // no trailing newline
		const after  = 'a\nB\n';
		const out = unifiedDiff('f.yaml', before, after);
		// Marker must appear after -b line
		const idx = out.indexOf('-b\n');
		expect(idx).toBeGreaterThan(-1);
		const afterDashB = out.slice(idx + 3);
		expect(afterDashB.startsWith('\\ No newline at end of file\n')).toBe(true);
	});

	test('neither before nor after ends with newline → marker on both - and + lines', () => {
		// git convention: marker is emitted after ANY terminal line that lacks newline,
		// regardless of whether both sides lack it.
		const before = 'a\nb';
		const after  = 'a\nB';
		const out = unifiedDiff('f.yaml', before, after);
		// Marker appears after -b and after +B
		const idxDel = out.indexOf('-b\n');
		expect(idxDel).toBeGreaterThan(-1);
		expect(out.slice(idxDel + 3).startsWith('\\ No newline at end of file\n')).toBe(true);
		const idxIns = out.indexOf('+B\n');
		expect(idxIns).toBeGreaterThan(-1);
		expect(out.slice(idxIns + 3).startsWith('\\ No newline at end of file\n')).toBe(true);
	});

	test('both end with newline → no marker', () => {
		const before = 'a\nb\n';
		const after  = 'a\nB\n';
		const out = unifiedDiff('f.yaml', before, after);
		expect(out).not.toContain('\\ No newline at end of file');
	});
});

// ---------------------------------------------------------------------------
// Hunk header format
// ---------------------------------------------------------------------------

describe('unifiedDiff — hunk header format', () => {
	test('hunk header has correct old/new counts', () => {
		// before: 5 lines, change line 3 only → hunk covers lines 1-5 (3 ctx each side clamped)
		// old: 5 lines, new: 5 lines
		const before = 'a\nb\nc\nd\ne\n';
		const after  = 'a\nb\nC\nd\ne\n';
		const out = unifiedDiff('f.yaml', before, after);
		// All 5 lines fit in single hunk: @@ -1,5 +1,5 @@
		expect(out).toContain('@@ -1,5 +1,5 @@');
	});

	test('insertion increases new count', () => {
		const before = 'a\nb\n';
		const after  = 'a\nx\nb\n';
		const out = unifiedDiff('f.yaml', before, after);
		// old: 2 lines, new: 3 lines
		expect(out).toContain('@@ -1,2 +1,3 @@');
	});

	test('deletion decreases new count', () => {
		const before = 'a\nb\nc\n';
		const after  = 'a\nc\n';
		const out = unifiedDiff('f.yaml', before, after);
		// old: 3 lines, new: 2 lines
		expect(out).toContain('@@ -1,3 +1,2 @@');
	});
});
