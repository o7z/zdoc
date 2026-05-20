import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './register-orphan.ts';
import type { DocsScan } from '../types.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let docsDir: string;

beforeEach(() => {
	docsDir = mkdtempSync(join(tmpdir(), 'fix-test-'));
});

afterEach(() => {
	rmSync(docsDir, { recursive: true, force: true });
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

/** Build a minimal DocsScan + sources map from the temp directory. */
function buildScan(metaPaths: string[], mdPaths: string[]): { scan: DocsScan; sources: Map<string, string> } {
	const { readFileSync } = require('node:fs') as typeof import('node:fs');
	const sources = new Map<string, string>();
	for (const mp of metaPaths) {
		sources.set(mp, readFileSync(mp, 'utf-8'));
	}
	return {
		scan: {
			docsDir,
			metaFiles: metaPaths,
			mdFiles: new Set(mdPaths),
		},
		sources,
	};
}

// ---------------------------------------------------------------------------
// (a) orphan .md detected — finding has correct payload, apply produces expected YAML
// ---------------------------------------------------------------------------

describe('register-orphan recipe', () => {
	test('(a) orphan detected: correct payload and apply output', () => {
		const metaPath = writeMeta(docsDir, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		const introMd = join(docsDir, 'intro.md');
		const orphanMd = join(docsDir, 'orphan.md');
		writeMd(introMd, '# Intro\n');
		writeMd(orphanMd, '# Orphan Page\n\nSome content.\n');

		const { scan, sources } = buildScan([metaPath], [introMd, orphanMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(1);
		expect(findings[0].recipeId).toBe('register-orphan');
		expect(findings[0].file).toBe(metaPath);
		expect(findings[0].payload?.orphanKey).toBe('orphan');
		expect(findings[0].payload?.derivedTitle).toBe('Orphan Page');

		const before = sources.get(metaPath)!;
		const after = recipe.apply!(findings[0], before);

		expect(after).toContain('orphan:');
		expect(after).toContain('title: Orphan Page');
		// intro still present
		expect(after).toContain('intro:');
	});

	// -------------------------------------------------------------------------
	// (b) no orphan → no finding
	// -------------------------------------------------------------------------

	test('(b) no orphan when all .md files are listed', () => {
		const metaPath = writeMeta(docsDir, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		const introMd = join(docsDir, 'intro.md');
		writeMd(introMd, '# Intro\n');

		const { scan, sources } = buildScan([metaPath], [introMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// (c) index.md in subdirectory is NOT flagged
	// -------------------------------------------------------------------------

	test('(c) index.md in subdirectory not flagged', () => {
		const subDir = join(docsDir, 'sub');
		mkdirSync(subDir);
		const metaPath = writeMeta(subDir, `title: Sub\n`);
		const indexMd = join(subDir, 'index.md');
		writeMd(indexMd, '# Sub Index\n');

		const { scan, sources } = buildScan([metaPath], [indexMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// (c2) index.md at docsDir root is also NOT flagged
	// -------------------------------------------------------------------------

	test('(c2) index.md at docsDir root not flagged', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const indexMd = join(docsDir, 'index.md');
		writeMd(indexMd, '# Home\n');

		const { scan, sources } = buildScan([metaPath], [indexMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// (d) README.md is NOT flagged
	// -------------------------------------------------------------------------

	test('(d) README.md not flagged', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const readmeMd = join(docsDir, 'README.md');
		writeMd(readmeMd, '# Readme\n');

		const { scan, sources } = buildScan([metaPath], [readmeMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// (e) title derived from H1 heading
	// -------------------------------------------------------------------------

	test('(e) title derived from H1 heading', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const pageMd = join(docsDir, 'page.md');
		writeMd(pageMd, '# My Great Page\n\nContent here.\n');

		const { scan, sources } = buildScan([metaPath], [pageMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.derivedTitle).toBe('My Great Page');
	});

	// -------------------------------------------------------------------------
	// (f) title falls back to basename when no H1
	// -------------------------------------------------------------------------

	test('(f) title falls back to basename when no H1', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const pageMd = join(docsDir, 'my-page.md');
		writeMd(pageMd, 'No heading here, just prose.\n');

		const { scan, sources } = buildScan([metaPath], [pageMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.derivedTitle).toBe('my-page');
	});

	// -------------------------------------------------------------------------
	// (g) idempotency: apply twice produces same output as once
	// -------------------------------------------------------------------------

	test('(g) idempotent: apply twice equals apply once', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const pageMd = join(docsDir, 'newpage.md');
		writeMd(pageMd, '# New Page\n');

		const { scan, sources } = buildScan([metaPath], [pageMd]);
		const findings = recipe.detect(scan, sources);
		expect(findings).toHaveLength(1);

		const before = sources.get(metaPath)!;
		const after1 = recipe.apply!(findings[0], before);
		const after2 = recipe.apply!(findings[0], after1);

		expect(after2).toBe(after1);
	});

	// -------------------------------------------------------------------------
	// (h) multiple orphans in same dir → multiple findings
	// -------------------------------------------------------------------------

	test('(h) multiple orphans produce multiple findings', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const alpha = join(docsDir, 'alpha.md');
		const beta = join(docsDir, 'beta.md');
		const gamma = join(docsDir, 'gamma.md');
		writeMd(alpha, '# Alpha\n');
		writeMd(beta, '# Beta\n');
		writeMd(gamma, '# Gamma\n');

		const { scan, sources } = buildScan([metaPath], [alpha, beta, gamma]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(3);

		const keys = findings.map((f) => f.payload?.orphanKey).sort();
		expect(keys).toEqual(['alpha', 'beta', 'gamma']);

		// Apply all findings sequentially and verify all three are in final output
		const before = sources.get(metaPath)!;
		let current = before;
		for (const f of findings) {
			current = recipe.apply!(f, current);
		}
		expect(current).toContain('alpha:');
		expect(current).toContain('beta:');
		expect(current).toContain('gamma:');
	});

	// -------------------------------------------------------------------------
	// (extra) H1 extraction skips YAML frontmatter
	// -------------------------------------------------------------------------

	test('H1 extracted correctly when file has frontmatter', () => {
		const metaPath = writeMeta(docsDir, `title: Site\n`);
		const pageMd = join(docsDir, 'fm-page.md');
		writeMd(pageMd, '---\ndraft: true\n---\n# Frontmatter Title\n\nContent.\n');

		const { scan, sources } = buildScan([metaPath], [pageMd]);
		const findings = recipe.detect(scan, sources);

		expect(findings).toHaveLength(1);
		expect(findings[0].payload?.derivedTitle).toBe('Frontmatter Title');
	});

	// =========================================================================
	// v1.17 extension: children schema parent + subdir orphans
	// =========================================================================

	test('children-schema parent: .md orphan appended to children list', () => {
		const metaPath = writeMeta(docsDir, `title: Site\nchildren:\n  - name: intro\n    title: Intro\n`);
		writeMd(join(docsDir, 'intro.md'), '# Intro\n');
		const orphan = join(docsDir, 'extra.md');
		writeMd(orphan, '# Extra Page\n');

		const { scan, sources } = buildScan([metaPath], [join(docsDir, 'intro.md'), orphan]);
		const findings = recipe.detect(scan, sources);

		expect(findings.length).toBe(1);
		expect(findings[0].payload?.entryType).toBe('file');
		expect(findings[0].payload?.orphanKey).toBe('extra');
		expect(findings[0].payload?.derivedTitle).toBe('Extra Page');

		const before = sources.get(metaPath)!;
		const after = recipe.apply!(findings[0], before);
		expect(after).toContain('  - name: intro');
		expect(after).toContain('  - name: extra');
		expect(after).toContain('    title: Extra Page');
		// Not added to pages
		expect(after).not.toContain('pages:');
	});

	test('children-schema parent: subdir orphan appended (no title field)', () => {
		const metaPath = writeMeta(docsDir, `title: Site\nchildren:\n  - name: intro\n    title: Intro\n`);
		writeMd(join(docsDir, 'intro.md'), '# Intro\n');

		// Subdir with its own _meta.yaml — not listed in parent children
		const subdir = join(docsDir, 'guide');
		mkdirSync(subdir);
		writeMeta(subdir, `title: GuideSection\n`);

		const { scan, sources } = buildScan([metaPath], [join(docsDir, 'intro.md')]);
		const findings = recipe.detect(scan, sources);

		// One finding for subdir 'guide'
		const subdirFinding = findings.find((f) => f.payload?.entryType === 'subdir');
		expect(subdirFinding).toBeDefined();
		expect(subdirFinding?.payload?.orphanKey).toBe('guide');
		expect(subdirFinding?.payload?.derivedTitle).toBeUndefined();

		const before = sources.get(metaPath)!;
		const after = recipe.apply!(subdirFinding!, before);
		expect(after).toContain('  - name: guide');
		// Subdir entry has only name, no title (title lives in subdir's own _meta.yaml)
		const guideIdx = after.indexOf('  - name: guide');
		const afterGuide = after.slice(guideIdx);
		expect(afterGuide).not.toMatch(/^\s{4}title:/m);
	});

	test('pages-schema parent: subdir does NOT trigger orphan finding', () => {
		// Parent uses legacy pages: schema
		const metaPath = writeMeta(docsDir, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docsDir, 'intro.md'), '# Intro\n');

		// Subdir with its own _meta.yaml
		const subdir = join(docsDir, 'guide');
		mkdirSync(subdir);
		writeMeta(subdir, `title: GuideSection\n`);

		const { scan, sources } = buildScan([metaPath], [join(docsDir, 'intro.md')]);
		const findings = recipe.detect(scan, sources);

		// No finding for the subdir under pages-schema (v1 self-discovery applies)
		const subdirFindings = findings.filter((f) => f.payload?.entryType === 'subdir');
		expect(subdirFindings.length).toBe(0);
	});

	test('subdir without _meta.yaml is NOT a finding (even on children parent)', () => {
		const metaPath = writeMeta(docsDir, `children:\n  - name: intro\n    title: Intro\n`);
		writeMd(join(docsDir, 'intro.md'), '# Intro\n');
		// Subdir without _meta.yaml (e.g. assets folder)
		mkdirSync(join(docsDir, 'assets'));

		const { scan, sources } = buildScan([metaPath], [join(docsDir, 'intro.md')]);
		const findings = recipe.detect(scan, sources);

		const subdirFindings = findings.filter((f) => f.payload?.entryType === 'subdir');
		expect(subdirFindings.length).toBe(0);
	});

	test('subdir already listed in children: not a finding', () => {
		const metaPath = writeMeta(
			docsDir,
			`children:\n  - name: intro\n    title: Intro\n  - name: guide\n`,
		);
		writeMd(join(docsDir, 'intro.md'), '# Intro\n');

		const subdir = join(docsDir, 'guide');
		mkdirSync(subdir);
		writeMeta(subdir, `title: Guide\n`);

		const { scan, sources } = buildScan([metaPath], [join(docsDir, 'intro.md')]);
		const findings = recipe.detect(scan, sources);

		const subdirFindings = findings.filter((f) => f.payload?.entryType === 'subdir');
		expect(subdirFindings.length).toBe(0);
	});

	test('apply is idempotent on children-schema parent', () => {
		const metaPath = writeMeta(docsDir, `children:\n  - name: intro\n    title: Intro\n`);
		writeMd(join(docsDir, 'intro.md'), '# Intro\n');
		writeMd(join(docsDir, 'extra.md'), '# Extra\n');

		const { scan, sources } = buildScan([metaPath], [join(docsDir, 'intro.md'), join(docsDir, 'extra.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(1);

		const before = sources.get(metaPath)!;
		const after1 = recipe.apply!(findings[0], before);
		// Second apply on the result should be a no-op (idempotency)
		const after2 = recipe.apply!(findings[0], after1);
		expect(after2).toBe(after1);
	});
});
