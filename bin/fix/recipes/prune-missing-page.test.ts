import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './prune-missing-page.ts';
import type { DocsScan } from '../types.ts';

let docsDir: string;

beforeEach(() => {
	docsDir = mkdtempSync(join(tmpdir(), 'zdoc-prune-missing-page-'));
});

afterEach(() => {
	rmSync(docsDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeMeta(dir: string, body: string): string {
	const metaPath = join(dir, '_meta.yaml');
	writeFileSync(metaPath, body, 'utf-8');
	return metaPath;
}

function writeMd(path: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, '# page\n', 'utf-8');
}

function makeScan(metaFiles: string[], mdFiles: string[]): DocsScan {
	return {
		docsDir,
		metaFiles,
		mdFiles: new Set(mdFiles),
	};
}

// ---------------------------------------------------------------------------
// (g) recipe shape assertions — run before any detect tests
// ---------------------------------------------------------------------------

describe('recipe shape', () => {
	test('(h) autoFix is false', () => {
		expect(recipe.autoFix).toBe(false);
	});

	test('(g) no apply function', () => {
		expect(recipe.apply).toBeUndefined();
	});

	test('id is prune-missing-page', () => {
		expect(recipe.id).toBe('prune-missing-page');
	});

	test('description is set', () => {
		expect(recipe.description).toBe('列出 pages 指向的不存在文件（仅提示，不自动修）');
	});
});

// ---------------------------------------------------------------------------
// detect() scenarios
// ---------------------------------------------------------------------------

describe('detect — .md files', () => {
	test('(a) pages key points to existing .md → no finding', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  intro:\n    title: Intro\n`,
		);
		const mdPath = join(docsDir, 'intro.md');
		writeMd(mdPath);
		const scan = makeScan([metaPath], [mdPath]);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(0);
	});

	test('(b) pages key points to non-existent .md → finding emitted', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  ghost:\n    title: Ghost\n`,
		);
		const scan = makeScan([metaPath], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(1);
		expect(findings[0].recipeId).toBe('prune-missing-page');
		expect(findings[0].file).toBe(metaPath);
		expect(findings[0].message).toContain('ghost');
		expect(findings[0].message).toContain('ghost.md');
		expect(findings[0].payload?.key).toBe('ghost');
		expect(findings[0].payload?.expectedPath).toContain('ghost.md');
	});
});

describe('detect — .pdf files', () => {
	test('(c) pages key points to existing .pdf → no finding', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  spec.pdf:\n    title: Spec\n`,
		);
		const pdfPath = join(docsDir, 'spec.pdf');
		writeFileSync(pdfPath, '%PDF-1.4\n', 'utf-8');
		const scan = makeScan([metaPath], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(0);
	});

	test('(d) pages key ends in .pdf but file missing → finding emitted', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  report.pdf:\n    title: Report\n`,
		);
		const scan = makeScan([metaPath], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(1);
		expect(findings[0].message).toContain('report.pdf');
		expect(findings[0].payload?.key).toBe('report.pdf');
		expect(findings[0].payload?.expectedPath).toContain('report.pdf');
	});
});

describe('detect — subdirectory keys', () => {
	test('(e) pages key matches existing subdirectory → no finding from this recipe', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  subdir:\n    title: Subdir\n`,
		);
		// Create subdir as a directory (not a file)
		mkdirSync(join(docsDir, 'subdir'), { recursive: true });
		const scan = makeScan([metaPath], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(0);
	});
});

describe('detect — multiple entries', () => {
	test('(f) multiple missing entries in same _meta.yaml → multiple findings', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  missing-a:\n    title: A\n  missing-b:\n    title: B\n  missing-c:\n    title: C\n`,
		);
		const scan = makeScan([metaPath], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(3);
		const keys = findings.map((f) => f.payload?.key).sort();
		expect(keys).toEqual(['missing-a', 'missing-b', 'missing-c']);
	});

	test('mix of valid and missing entries → only missing ones emitted', () => {
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  exists:\n    title: Exists\n  missing:\n    title: Missing\n`,
		);
		const existsMd = join(docsDir, 'exists.md');
		writeMd(existsMd);
		const scan = makeScan([metaPath], [existsMd]);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.key).toBe('missing');
	});

	test('empty _meta.yaml (no pages key) → no findings', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const scan = makeScan([metaPath], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings).toHaveLength(0);
	});
});
