import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './derive-missing-title.ts';
import type { DocsScan } from '../types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let docsDir: string;

beforeEach(() => {
	docsDir = mkdtempSync(join(tmpdir(), 'zdoc-dmt-test-'));
});

afterEach(() => {
	rmSync(docsDir, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string): string {
	const path = join(dir, '_meta.yaml');
	writeFileSync(path, body, 'utf-8');
	return path;
}

function writeMd(dir: string, name: string, body: string): string {
	const path = join(dir, name);
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body, 'utf-8');
	return path;
}

function makeScan(metaPath: string, mdPaths: string[]): { scan: DocsScan; sources: Map<string, string> } {
	const { readFileSync } = require('node:fs') as typeof import('node:fs');
	const sources = new Map<string, string>();
	sources.set(metaPath, readFileSync(metaPath, 'utf-8'));
	const scan: DocsScan = {
		docsDir,
		metaFiles: [metaPath],
		mdFiles: new Set(mdPaths),
	};
	return { scan, sources };
}

// ---------------------------------------------------------------------------
// (a) missing title → derived from `# H1` heading of the .md
// ---------------------------------------------------------------------------

describe('derive-missing-title recipe', () => {
	test('(a) missing title → derived from H1 heading', () => {
		writeMd(docsDir, 'intro.md', '# Introduction\n\nWelcome.\n');
		const metaPath = writeMeta(docsDir, `pages:\n  intro:\n    order: 1\n`);
		const { scan, sources } = makeScan(metaPath, [join(docsDir, 'intro.md')]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.pageKey).toBe('intro');
		expect(findings[0].payload?.derivedTitle).toBe('Introduction');

		const after = recipe.apply!(findings[0], sources.get(metaPath)!);
		expect(after).toContain('title: Introduction');
	});

	// -------------------------------------------------------------------------
	// (b) missing title + no H1 → fallback to basename
	// -------------------------------------------------------------------------

	test('(b) missing title + no H1 → fallback to basename', () => {
		writeMd(docsDir, 'setup.md', 'No heading here.\n\nJust prose.\n');
		const metaPath = writeMeta(docsDir, `pages:\n  setup:\n    order: 2\n`);
		const { scan, sources } = makeScan(metaPath, [join(docsDir, 'setup.md')]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.derivedTitle).toBe('setup');

		const after = recipe.apply!(findings[0], sources.get(metaPath)!);
		expect(after).toContain('title: setup');
	});

	// -------------------------------------------------------------------------
	// (c) title present (non-empty string) → no finding
	// -------------------------------------------------------------------------

	test('(c) title already set → no finding', () => {
		writeMd(docsDir, 'guide.md', '# Guide\n');
		const metaPath = writeMeta(docsDir, `pages:\n  guide:\n    title: My Guide\n`);
		const { scan, sources } = makeScan(metaPath, [join(docsDir, 'guide.md')]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// (d) title is empty string "" → finding emitted, treat as missing
	// -------------------------------------------------------------------------

	test('(d) title is empty string → finding emitted', () => {
		writeMd(docsDir, 'empty-title.md', '# Real Title\n');
		const metaPath = writeMeta(docsDir, `pages:\n  empty-title:\n    title: ""\n`);
		const { scan, sources } = makeScan(metaPath, [join(docsDir, 'empty-title.md')]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.derivedTitle).toBe('Real Title');
	});

	// -------------------------------------------------------------------------
	// (e) entry is .pdf → no finding even if title missing
	// -------------------------------------------------------------------------

	test('(e) .pdf entry → no finding', () => {
		// No .md file needed — recipe skips PDF entries before checking disk
		const metaPath = writeMeta(docsDir, `pages:\n  manual.pdf:\n    order: 1\n`);
		const { scan, sources } = makeScan(metaPath, []);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// (f) idempotency: apply twice = once
	// -------------------------------------------------------------------------

	test('(f) idempotency: apply twice produces same result', () => {
		writeMd(docsDir, 'faq.md', '# FAQ\n');
		const metaPath = writeMeta(docsDir, `pages:\n  faq:\n    order: 3\n`);
		const { scan, sources } = makeScan(metaPath, [join(docsDir, 'faq.md')]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);

		const after1 = recipe.apply!(findings[0], sources.get(metaPath)!);
		const after2 = recipe.apply!(findings[0], after1);
		expect(after1).toBe(after2);
	});

	// -------------------------------------------------------------------------
	// (g) multiple entries missing title → multiple findings, apply chains
	// -------------------------------------------------------------------------

	test('(g) multiple entries missing title → multiple findings, chain apply', () => {
		writeMd(docsDir, 'alpha.md', '# Alpha\n');
		writeMd(docsDir, 'beta.md', '# Beta\n');
		const metaPath = writeMeta(
			docsDir,
			`pages:\n  alpha:\n    order: 1\n  beta:\n    order: 2\n`,
		);
		const { scan, sources } = makeScan(metaPath, [
			join(docsDir, 'alpha.md'),
			join(docsDir, 'beta.md'),
		]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(2);

		// Chain apply: thread source through both findings
		let current = sources.get(metaPath)!;
		for (const f of findings) {
			current = recipe.apply!(f, current);
		}
		expect(current).toContain('title: Alpha');
		expect(current).toContain('title: Beta');
	});

	// -------------------------------------------------------------------------
	// (h) page entry points to non-existent .md → no finding
	// -------------------------------------------------------------------------

	test('(h) page points to non-existent .md → no finding', () => {
		// No .md file written — the file does not exist on disk
		const metaPath = writeMeta(docsDir, `pages:\n  ghost:\n    order: 1\n`);
		const { scan, sources } = makeScan(metaPath, []);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Extra: H1 extraction skips YAML frontmatter correctly
	// -------------------------------------------------------------------------

	test('H1 extraction skips frontmatter', () => {
		writeMd(
			docsDir,
			'frontmatter.md',
			'---\ndraft: true\n---\n\n# Actual Title\n\nContent.\n',
		);
		const metaPath = writeMeta(docsDir, `pages:\n  frontmatter:\n    order: 1\n`);
		const { scan, sources } = makeScan(metaPath, [join(docsDir, 'frontmatter.md')]);

		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.derivedTitle).toBe('Actual Title');
	});
});
