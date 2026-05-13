// Tests for the remove-subdir-as-file recipe (US-006).
// Framework: bun:test

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './remove-subdir-as-file.js';
import type { DocsScan, Finding } from '../types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let docsDir: string;

beforeEach(() => {
	docsDir = mkdtempSync(join(tmpdir(), 'zdoc-recipe-test-'));
});

afterEach(() => {
	rmSync(docsDir, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string): string {
	const p = join(dir, '_meta.yaml');
	writeFileSync(p, body, 'utf-8');
	return p;
}

function writeFile(path: string, body = '') {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body, 'utf-8');
}

function makeSubdir(path: string) {
	mkdirSync(path, { recursive: true });
}

function buildScan(metaPath: string, metaSource: string, extraMds: string[] = []): [DocsScan, Map<string, string>] {
	const mdFiles = new Set(extraMds);
	const scan: DocsScan = {
		docsDir,
		metaFiles: [metaPath],
		mdFiles,
	};
	const sources = new Map([[metaPath, metaSource]]);
	return [scan, sources];
}

// ---------------------------------------------------------------------------
// (a) pages key matches subdirectory → finding emitted, apply removes it
// ---------------------------------------------------------------------------

describe('(a) pages key is a subdirectory — not a .md file', () => {
	test('detect emits one finding for the offending key', () => {
		const metaSource = `title: Root\npages:\n  guide:\n    title: Guide\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'guide'));          // guide/ exists, guide.md does NOT

		const [scan, sources] = buildScan(metaPath, metaSource);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(1);
		expect(findings[0].recipeId).toBe('remove-subdir-as-file');
		expect(findings[0].file).toBe(metaPath);
		expect((findings[0].payload as { key: string }).key).toBe('guide');
	});

	test('apply removes the offending key from the YAML', () => {
		const metaSource = `title: Root\npages:\n  guide:\n    title: Guide\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'guide'));

		const [scan, sources] = buildScan(metaPath, metaSource);
		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);

		const after = recipe.apply!(findings[0], metaSource);
		expect(after).not.toContain('guide');
		// Other top-level fields preserved
		expect(after).toContain('title: Root');
	});
});

// ---------------------------------------------------------------------------
// (b) pages key matches a .md file → no finding (correct registration)
// ---------------------------------------------------------------------------

describe('(b) pages key has matching .md file — no finding', () => {
	test('no finding when foo.md exists', () => {
		const metaSource = `title: Root\npages:\n  intro:\n    title: Intro\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		writeFile(join(docsDir, 'intro.md'), '# Intro\n');   // .md exists

		const [scan, sources] = buildScan(metaPath, metaSource, [join(docsDir, 'intro.md')]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (c) pages key matches NEITHER file nor subdir → no finding from this recipe
// ---------------------------------------------------------------------------

describe('(c) pages key has neither .md nor subdir — no finding from this recipe', () => {
	test('ghost key (nothing on disk) emits no finding', () => {
		const metaSource = `title: Root\npages:\n  ghost:\n    title: Ghost\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		// ghost.md does NOT exist, ghost/ does NOT exist

		const [scan, sources] = buildScan(metaPath, metaSource);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (d) pages key has BOTH .md AND subdir → no finding (.md exists = correct)
// ---------------------------------------------------------------------------

describe('(d) pages key has both .md file and subdir — no finding', () => {
	test('no finding when both foo.md and foo/ exist', () => {
		const metaSource = `title: Root\npages:\n  api:\n    title: API\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		writeFile(join(docsDir, 'api.md'), '# API\n');   // .md exists
		makeSubdir(join(docsDir, 'api'));                 // subdir also exists

		const [scan, sources] = buildScan(metaPath, metaSource, [join(docsDir, 'api.md')]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (e) Idempotency: apply twice = apply once
// ---------------------------------------------------------------------------

describe('(e) idempotency', () => {
	test('applying twice produces the same result as applying once', () => {
		const metaSource = `title: Root\npages:\n  guide:\n    title: Guide\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'guide'));

		const [scan, sources] = buildScan(metaPath, metaSource);
		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);

		const after1 = recipe.apply!(findings[0], metaSource);

		// Second apply on the already-fixed source
		const after2 = recipe.apply!(findings[0], after1);

		expect(after2).toBe(after1);
	});

	test('detect on already-fixed source emits no finding', () => {
		const metaSource = `title: Root\npages:\n  guide:\n    title: Guide\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'guide'));

		const [scan, sources] = buildScan(metaPath, metaSource);
		const findings = recipe.detect(scan, sources);
		const after = recipe.apply!(findings[0], metaSource);

		// Re-scan with the fixed content
		const sources2 = new Map([[metaPath, after]]);
		const findings2 = recipe.detect(scan, sources2);

		expect(findings2).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// (f) Multiple bad keys in same _meta.yaml → multiple findings, chain applies
// ---------------------------------------------------------------------------

describe('(f) multiple bad keys in one _meta.yaml', () => {
	test('detect emits one finding per offending key', () => {
		const metaSource = [
			'title: Root',
			'pages:',
			'  foo:',
			'    title: Foo',
			'  bar:',
			'    title: Bar',
			'  legit:',
			'    title: Legit',
		].join('\n') + '\n';
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'foo'));    // foo/ exists, foo.md does NOT
		makeSubdir(join(docsDir, 'bar'));    // bar/ exists, bar.md does NOT
		writeFile(join(docsDir, 'legit.md'), '# Legit\n'); // legit is fine

		const [scan, sources] = buildScan(metaPath, metaSource, [join(docsDir, 'legit.md')]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(2);
		const keys = findings.map((f) => (f.payload as { key: string }).key).sort();
		expect(keys).toEqual(['bar', 'foo']);
	});

	test('chaining apply through both findings removes both keys, legit key survives', () => {
		const metaSource = [
			'title: Root',
			'pages:',
			'  foo:',
			'    title: Foo',
			'  bar:',
			'    title: Bar',
			'  legit:',
			'    title: Legit',
		].join('\n') + '\n';
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'foo'));
		makeSubdir(join(docsDir, 'bar'));
		writeFile(join(docsDir, 'legit.md'), '# Legit\n');

		const [scan, sources] = buildScan(metaPath, metaSource, [join(docsDir, 'legit.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(2);

		// Chain: apply first finding, then second finding on the result
		let current = metaSource;
		for (const f of findings) {
			current = recipe.apply!(f, current);
		}

		expect(current).not.toContain('foo');
		expect(current).not.toContain('bar');
		expect(current).toContain('legit');
		expect(current).toContain('title: Root');
	});
});

// ---------------------------------------------------------------------------
// (g) After removal, if pages becomes empty, no pages: key in output
// ---------------------------------------------------------------------------

describe('(g) empty pages after removal', () => {
	test('pages key omitted from output when last entry is removed', () => {
		const metaSource = `title: Root\npages:\n  guide:\n    title: Guide\n`;
		const metaPath = writeMeta(docsDir, metaSource);
		makeSubdir(join(docsDir, 'guide'));

		const [scan, sources] = buildScan(metaPath, metaSource);
		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);

		const after = recipe.apply!(findings[0], metaSource);

		expect(after).not.toContain('pages:');
		expect(after).not.toContain('guide');
		expect(after).toContain('title: Root');
	});
});

// ---------------------------------------------------------------------------
// Metadata sanity checks
// ---------------------------------------------------------------------------

describe('recipe metadata', () => {
	test('id is correct', () => {
		expect(recipe.id).toBe('remove-subdir-as-file');
	});

	test('autoFix is true', () => {
		expect(recipe.autoFix).toBe(true);
	});

	test('description is set', () => {
		expect(recipe.description).toBe('删除把子目录误写成 page key 的条目');
	});

	test('apply function is defined', () => {
		expect(typeof recipe.apply).toBe('function');
	});
});
