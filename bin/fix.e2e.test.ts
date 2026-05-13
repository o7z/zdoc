// zdoc fix — end-to-end tests for the fix engine.
//
// Each scenario creates an isolated temp fixture, runs scan + apply, then
// reads back files and asserts content. Tests do NOT depend on the project's
// own docs/ tree. All fixtures are cleaned up in afterEach/afterAll.
//
// Run: bun test bin/fix.e2e.test.ts

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
	mkdtempSync,
	writeFileSync,
	mkdirSync,
	rmSync,
	readFileSync,
	existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, apply } from './fix/engine.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'fix-e2e-'));
});

afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string): string {
	const p = join(dir, '_meta.yaml');
	writeFileSync(p, body, 'utf-8');
	return p;
}

function writeMd(path: string, body: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body, 'utf-8');
}

// ---------------------------------------------------------------------------
// Scenario 1 — single orphan + register
//
// docs/_meta.yaml has title: only; foo.md sits next to it but is not listed.
// scan must find 1 register-orphan finding; apply must write pages: { foo: ... }
// ---------------------------------------------------------------------------

describe('scenario 1 — single orphan + register', () => {
	test('scan finds 1 finding; apply adds foo to _meta.yaml pages', () => {
		const metaPath = writeMeta(docs, 'title: Site\n');
		writeMd(join(docs, 'foo.md'), '# Foo Page\n\nContent.\n');

		const result = scan(docs);

		const orphanFindings = result.findings.filter((f) => f.recipeId === 'register-orphan');
		expect(orphanFindings).toHaveLength(1);
		expect(orphanFindings[0].file).toBe(metaPath);

		const applied = apply(result);
		expect(applied.failed).toEqual([]);
		expect(applied.written).toHaveLength(1);
		expect(applied.written[0].file).toBe(metaPath);
		expect(applied.written[0].recipeIds).toContain('register-orphan');

		const content = readFileSync(metaPath, 'utf-8');
		expect(content).toContain('foo:');
		expect(content).toContain('title: Foo Page');
	});
});

// ---------------------------------------------------------------------------
// Scenario 2 — subdir-as-file fix
//
// _meta.yaml lists pages: { guide: ... }; guide/ directory exists but guide.md
// does NOT. scan must find 1 remove-subdir-as-file finding; apply removes key.
// ---------------------------------------------------------------------------

describe('scenario 2 — subdir-as-file fix', () => {
	test('scan finds 1 finding; apply removes guide key from pages', () => {
		const metaPath = writeMeta(
			docs,
			'title: Root\npages:\n  guide:\n    title: Guide\n',
		);
		mkdirSync(join(docs, 'guide'), { recursive: true }); // guide/ dir exists, guide.md absent

		const result = scan(docs);

		const subdirFindings = result.findings.filter((f) => f.recipeId === 'remove-subdir-as-file');
		expect(subdirFindings).toHaveLength(1);
		expect(subdirFindings[0].file).toBe(metaPath);

		const applied = apply(result);
		expect(applied.failed).toEqual([]);
		expect(applied.written).toHaveLength(1);

		const content = readFileSync(metaPath, 'utf-8');
		expect(content).not.toContain('guide:');
		expect(content).toContain('title: Root');
	});
});

// ---------------------------------------------------------------------------
// Scenario 3 — missing title derivation
//
// _meta.yaml has pages: { intro: { order: 1 } } (no title); intro.md has # Introduction.
// scan must find 1 derive-missing-title finding; apply sets title: Introduction.
// ---------------------------------------------------------------------------

describe('scenario 3 — derive missing title', () => {
	test('scan finds 1 finding; apply sets title: Introduction', () => {
		const metaPath = writeMeta(
			docs,
			'pages:\n  intro:\n    order: 1\n',
		);
		writeMd(join(docs, 'intro.md'), '# Introduction\n\nWelcome.\n');

		const result = scan(docs);

		const titleFindings = result.findings.filter((f) => f.recipeId === 'derive-missing-title');
		expect(titleFindings).toHaveLength(1);
		expect(titleFindings[0].file).toBe(metaPath);

		const applied = apply(result);
		expect(applied.failed).toEqual([]);
		expect(applied.written).toHaveLength(1);

		const content = readFileSync(metaPath, 'utf-8');
		expect(content).toContain('title: Introduction');
		expect(content).toContain('order: 1');
	});
});

// ---------------------------------------------------------------------------
// Scenario 4 — scaffold a missing _meta.yaml
//
// Subdirectory with only .md files and no _meta.yaml. scan must find 1
// scaffold-meta-yaml finding (isNewFile); apply creates the file with
// title (basename) + pages map.
// ---------------------------------------------------------------------------

describe('scenario 4 — scaffold missing _meta.yaml', () => {
	test('scan finds 1 scaffold finding; apply creates _meta.yaml with title + pages', () => {
		const subDir = join(docs, 'guide');
		mkdirSync(subDir, { recursive: true });
		writeMd(join(subDir, 'start.md'), '# Getting Started\n');
		writeMd(join(subDir, 'config.md'), '# Configuration\n');

		const newMetaPath = join(subDir, '_meta.yaml');
		expect(existsSync(newMetaPath)).toBe(false);

		const result = scan(docs);

		const scaffoldFindings = result.findings.filter((f) => f.recipeId === 'scaffold-meta-yaml');
		expect(scaffoldFindings).toHaveLength(1);
		expect(scaffoldFindings[0].file).toBe(newMetaPath);
		expect((scaffoldFindings[0].payload as Record<string, unknown>)?.isNewFile).toBe(true);

		const applied = apply(result);
		expect(applied.failed).toEqual([]);
		expect(applied.written).toHaveLength(1);
		expect(applied.written[0].file).toBe(newMetaPath);

		expect(existsSync(newMetaPath)).toBe(true);
		const content = readFileSync(newMetaPath, 'utf-8');
		expect(content).toContain('title: guide');
		expect(content).toContain('pages:');
		expect(content).toContain('start:');
		expect(content).toContain('config:');
		expect(content).toContain('Getting Started');
		expect(content).toContain('Configuration');
	});
});

// ---------------------------------------------------------------------------
// Scenario 5 — combination: multiple recipes across multiple files
//
// docsDir layout:
//   _meta.yaml          (has title: only; bar.md is orphan → register-orphan)
//   bar.md              (# Bar)
//   sub/                (no _meta.yaml, has page.md → scaffold-meta-yaml)
//     page.md           (# Sub Page)
//   ref/
//     _meta.yaml        (pages: { detail: { order: 1 } } no title → derive-missing-title)
//     detail.md         (# Detail)
//
// Expected: 3 findings across 3 files; apply writes all 3 correctly.
// ---------------------------------------------------------------------------

describe('scenario 5 — combination: orphan + scaffold + missing-title', () => {
	test('scan finds all 3 types; apply writes 3 files correctly', () => {
		// Root _meta.yaml — bar.md is orphan
		const rootMetaPath = writeMeta(docs, 'title: Site\n');
		writeMd(join(docs, 'bar.md'), '# Bar\n');

		// sub/ — no _meta.yaml, has page.md
		const subDir = join(docs, 'sub');
		mkdirSync(subDir, { recursive: true });
		writeMd(join(subDir, 'page.md'), '# Sub Page\n');
		const subMetaPath = join(subDir, '_meta.yaml');

		// ref/ — _meta.yaml with missing title
		const refDir = join(docs, 'ref');
		mkdirSync(refDir, { recursive: true });
		const refMetaPath = writeMeta(refDir, 'pages:\n  detail:\n    order: 1\n');
		writeMd(join(refDir, 'detail.md'), '# Detail\n');

		const result = scan(docs);

		// Exactly 3 auto-fixable recipe types must be present
		const orphanF = result.findings.filter((f) => f.recipeId === 'register-orphan');
		const scaffoldF = result.findings.filter((f) => f.recipeId === 'scaffold-meta-yaml');
		const titleF = result.findings.filter((f) => f.recipeId === 'derive-missing-title');

		expect(orphanF.length).toBeGreaterThanOrEqual(1);
		expect(scaffoldF.length).toBeGreaterThanOrEqual(1);
		expect(titleF.length).toBeGreaterThanOrEqual(1);

		const applied = apply(result);
		expect(applied.failed).toEqual([]);
		// 3 distinct files written
		expect(applied.written.length).toBeGreaterThanOrEqual(3);

		// Root _meta.yaml now has bar registered
		const rootContent = readFileSync(rootMetaPath, 'utf-8');
		expect(rootContent).toContain('bar:');
		expect(rootContent).toContain('title: Bar');

		// sub/_meta.yaml was created
		expect(existsSync(subMetaPath)).toBe(true);
		const subContent = readFileSync(subMetaPath, 'utf-8');
		expect(subContent).toContain('title: sub');
		expect(subContent).toContain('page:');

		// ref/_meta.yaml now has title on detail
		const refContent = readFileSync(refMetaPath, 'utf-8');
		expect(refContent).toContain('title: Detail');
	});
});

// ---------------------------------------------------------------------------
// Scenario 6 — dry-run does not write
//
// scan finds findings; do NOT call apply; original files must be unchanged.
// ---------------------------------------------------------------------------

describe('scenario 6 — dry-run: scan without apply leaves files untouched', () => {
	test('scan finds findings but files remain unchanged when apply is not called', () => {
		const originalContent = 'title: Site\n';
		const metaPath = writeMeta(docs, originalContent);
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');

		const result = scan(docs);
		const orphanFindings = result.findings.filter((f) => f.recipeId === 'register-orphan');
		expect(orphanFindings.length).toBeGreaterThan(0);

		// Deliberately do NOT call apply()
		const content = readFileSync(metaPath, 'utf-8');
		expect(content).toBe(originalContent);
		expect(content).not.toContain('orphan:');
	});
});

// ---------------------------------------------------------------------------
// Scenario 7 — SHA mismatch detection
//
// scan finds findings, then a file is modified on disk before apply() is
// called. The modified file must appear in failed[] with sha mismatch reason.
// ---------------------------------------------------------------------------

describe('scenario 7 — SHA mismatch detection', () => {
	test('file mutated between scan and apply → appears in failed[], not written', () => {
		const metaPath = writeMeta(docs, 'title: Site\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');

		const result = scan(docs);
		const orphanFindings = result.findings.filter((f) => f.recipeId === 'register-orphan');
		expect(orphanFindings.length).toBeGreaterThan(0);

		// Mutate the file out-of-band after scan
		writeFileSync(metaPath, 'title: TamperedExternally\n', 'utf-8');

		const applied = apply(result);
		expect(applied.written).toEqual([]);
		expect(applied.failed.length).toBeGreaterThan(0);
		expect(applied.failed[0].file).toBe(metaPath);
		expect(applied.failed[0].reason).toContain('sha 不匹配');

		// File content should still be the tampered version (not overwritten)
		expect(readFileSync(metaPath, 'utf-8')).toBe('title: TamperedExternally\n');
	});
});

// ---------------------------------------------------------------------------
// Scenario 8 — manual-review-only: prune-missing-page findings only
//
// A tree where the only findings are prune-missing-page (autoFix: false).
// apply() written must be empty — nothing auto-fixed.
// ---------------------------------------------------------------------------

describe('scenario 8 — manual-review-only: prune-missing-page only', () => {
	test('apply written is empty when all findings are manualReview', () => {
		// All pages keys point to non-existent .md files → prune-missing-page only
		// No orphan .md present, so register-orphan is silent.
		// No missing-title entries (title is provided), no subdir confusion.
		writeMeta(docs, 'title: Site\npages:\n  ghost:\n    title: Ghost\n');
		// No ghost.md written on disk → prune-missing-page fires
		// No extra .md files → no orphan / scaffold findings

		const result = scan(docs);

		const pruneFindings = result.findings.filter((f) => f.recipeId === 'prune-missing-page');
		expect(pruneFindings.length).toBeGreaterThan(0);
		expect(pruneFindings.every((f) => f.manualReview === true)).toBe(true);

		const applied = apply(result);
		expect(applied.written).toEqual([]);
		expect(applied.failed).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Scenario 9 — --recipe filter: scan with recipeId option
//
// Tree triggers multiple recipe types; scanning with recipeId: 'register-orphan'
// must return ONLY register-orphan findings.
// ---------------------------------------------------------------------------

describe('scenario 9 — recipeId filter', () => {
	test('scan with recipeId returns only that recipe\'s findings', () => {
		// root _meta.yaml — orphan present
		writeMeta(docs, 'title: Site\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');

		// ref/ — _meta.yaml with missing title (derive-missing-title would fire)
		const refDir = join(docs, 'ref');
		mkdirSync(refDir, { recursive: true });
		writeMeta(refDir, 'pages:\n  intro:\n    order: 1\n');
		writeMd(join(refDir, 'intro.md'), '# Intro\n');

		// sub/ — no _meta.yaml, has .md (scaffold-meta-yaml would fire)
		const subDir = join(docs, 'sub');
		mkdirSync(subDir, { recursive: true });
		writeMd(join(subDir, 'page.md'), '# Page\n');

		// Full scan should have multiple recipe types
		const fullResult = scan(docs);
		const recipeIds = new Set(fullResult.findings.map((f) => f.recipeId));
		expect(recipeIds.size).toBeGreaterThan(1);

		// Filtered scan must return only register-orphan
		const filtered = scan(docs, { recipeId: 'register-orphan' });
		expect(filtered.findings.length).toBeGreaterThan(0);
		for (const f of filtered.findings) {
			expect(f.recipeId).toBe('register-orphan');
		}
	});
});

// ---------------------------------------------------------------------------
// Scenario 10 — idempotency
//
// Run scan + apply once. Then run scan again on the same tree.
// Auto-fixed findings from the first run must not appear in the second scan.
// ---------------------------------------------------------------------------

describe('scenario 10 — idempotency', () => {
	test('second scan after apply reports no auto-fixable findings for the fixed issues', () => {
		// Setup: orphan.md not registered
		writeMeta(docs, 'title: Site\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');

		// First scan + apply
		const result1 = scan(docs);
		const orphansBefore = result1.findings.filter((f) => f.recipeId === 'register-orphan');
		expect(orphansBefore.length).toBeGreaterThan(0);

		const applied = apply(result1);
		expect(applied.failed).toEqual([]);
		expect(applied.written.length).toBeGreaterThan(0);

		// Second scan: orphan should be gone
		const result2 = scan(docs);
		const orphansAfter = result2.findings.filter((f) => f.recipeId === 'register-orphan');
		expect(orphansAfter).toHaveLength(0);
	});
});
