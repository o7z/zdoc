// Tests for scaffold-meta-yaml recipe.
// Run: bun test bin/fix/recipes/scaffold-meta-yaml.test.ts

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
	mkdtempSync,
	writeFileSync,
	mkdirSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import recipe from './scaffold-meta-yaml.ts';
import { parseDirMetaFromString } from '../yaml-io.ts';
import type { DocsScan } from '../types.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-scaffold-test-'));
});

afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

/** Build a minimal DocsScan from explicit file lists. */
function makeScan(docsDir: string, metaFiles: string[], mdFiles: string[]): DocsScan {
	return { docsDir, metaFiles, mdFiles: new Set(mdFiles) };
}

// ---------------------------------------------------------------------------
// (a) directory with .md but no _meta.yaml → file scaffolded
// ---------------------------------------------------------------------------

describe('detect — basic scaffolding', () => {
	test('(a) directory with .md but no _meta.yaml → one finding emitted', () => {
		mkdirSync(join(docs, 'guide'));
		writeFileSync(join(docs, 'guide', 'intro.md'), '# Introduction\n');

		const scan = makeScan(
			docs,
			[],
			[join(docs, 'guide', 'intro.md')],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);
		expect(findings[0].recipeId).toBe('scaffold-meta-yaml');
		expect(findings[0].file).toBe(join(docs, 'guide', '_meta.yaml'));
		expect(findings[0].payload?.isNewFile).toBe(true);
		expect(findings[0].payload?.dirPath).toBe(join(docs, 'guide'));
	});

	test('(a) apply produces valid _meta.yaml with correct title and pages', () => {
		mkdirSync(join(docs, 'guide'));
		writeFileSync(join(docs, 'guide', 'intro.md'), '# Introduction\n');
		writeFileSync(join(docs, 'guide', 'setup.md'), '# Setup Guide\n');

		const scan = makeScan(
			docs,
			[],
			[join(docs, 'guide', 'intro.md'), join(docs, 'guide', 'setup.md')],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);

		const result = recipe.apply!(findings[0], '');
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);

		// Title is directory basename verbatim
		expect(result).toContain('title: guide');

		// Pages present
		expect(result).toContain('pages:');
		expect(result).toContain('intro:');
		expect(result).toContain('setup:');

		// Page titles from H1
		expect(result).toContain('Introduction');
		expect(result).toContain('Setup Guide');
	});
});

// ---------------------------------------------------------------------------
// (b) directory with _meta.yaml → no finding
// ---------------------------------------------------------------------------

describe('detect — already has _meta.yaml', () => {
	test('(b) directory with _meta.yaml → no finding emitted', () => {
		mkdirSync(join(docs, 'guide'));
		writeFileSync(join(docs, 'guide', 'intro.md'), '# Introduction\n');
		writeFileSync(join(docs, 'guide', '_meta.yaml'), 'title: Guide\n');

		const scan = makeScan(
			docs,
			[join(docs, 'guide', '_meta.yaml')],
			[join(docs, 'guide', 'intro.md')],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// (c) directory with NO .md → no finding
// ---------------------------------------------------------------------------

describe('detect — no .md files', () => {
	test('(c) parent directory with only subdirectory children → no finding for parent', () => {
		mkdirSync(join(docs, 'empty-dir'));
		mkdirSync(join(docs, 'empty-dir', 'sub'));
		writeFileSync(join(docs, 'empty-dir', 'sub', 'page.md'), '# Page\n');

		const scan = makeScan(
			docs,
			[],
			[join(docs, 'empty-dir', 'sub', 'page.md')],
		);

		const findings = recipe.detect(scan, new Map());
		// Only sub dir should get a finding, not empty-dir
		const emptyDirFinding = findings.find(
			(f) => f.payload?.dirPath === join(docs, 'empty-dir'),
		);
		expect(emptyDirFinding).toBeUndefined();
	});

	test('(c) scan with no .md files → no findings', () => {
		const scan = makeScan(docs, [], []);
		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// (d) lexicographic order of pages
// ---------------------------------------------------------------------------

describe('apply — lexicographic page order', () => {
	test('(d) .md files appear in lexicographic order in pages', () => {
		mkdirSync(join(docs, 'ref'));
		writeFileSync(join(docs, 'ref', 'zebra.md'), '# Zebra\n');
		writeFileSync(join(docs, 'ref', 'alpha.md'), '# Alpha\n');
		writeFileSync(join(docs, 'ref', 'middle.md'), '# Middle\n');

		const scan = makeScan(
			docs,
			[],
			[
				join(docs, 'ref', 'zebra.md'),
				join(docs, 'ref', 'alpha.md'),
				join(docs, 'ref', 'middle.md'),
			],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);

		const result = recipe.apply!(findings[0], '');
		const meta = parseDirMetaFromString(result);
		expect(meta).not.toBeNull();
		expect(meta!.pages).toBeDefined();

		const keys = Object.keys(meta!.pages!);
		expect(keys).toEqual(['alpha', 'middle', 'zebra']);
	});
});

// ---------------------------------------------------------------------------
// (e) title derivation: H1 + fallback to basename
// ---------------------------------------------------------------------------

describe('apply — title derivation', () => {
	test('(e) page title from first H1 heading', () => {
		mkdirSync(join(docs, 'sec'));
		writeFileSync(join(docs, 'sec', 'page.md'), '# My Page Title\nsome body\n');

		const scan = makeScan(docs, [], [join(docs, 'sec', 'page.md')]);
		const findings = recipe.detect(scan, new Map());
		const result = recipe.apply!(findings[0], '');

		const meta = parseDirMetaFromString(result);
		expect(meta!.pages!['page'].title).toBe('My Page Title');
	});

	test('(e) page title falls back to basename when no H1', () => {
		mkdirSync(join(docs, 'sec'));
		writeFileSync(join(docs, 'sec', 'no-heading.md'), 'Just some content\nNo heading here\n');

		const scan = makeScan(docs, [], [join(docs, 'sec', 'no-heading.md')]);
		const findings = recipe.detect(scan, new Map());
		const result = recipe.apply!(findings[0], '');

		const meta = parseDirMetaFromString(result);
		expect(meta!.pages!['no-heading'].title).toBe('no-heading');
	});

	test('(e) H1 extraction skips YAML frontmatter', () => {
		mkdirSync(join(docs, 'sec'));
		writeFileSync(
			join(docs, 'sec', 'front.md'),
			'---\ntitle: frontmatter title\n---\n# Real H1\nBody\n',
		);

		const scan = makeScan(docs, [], [join(docs, 'sec', 'front.md')]);
		const findings = recipe.detect(scan, new Map());
		const result = recipe.apply!(findings[0], '');

		const meta = parseDirMetaFromString(result);
		expect(meta!.pages!['front'].title).toBe('Real H1');
	});
});

// ---------------------------------------------------------------------------
// (f) index.md NOT registered
// ---------------------------------------------------------------------------

describe('apply — index.md exclusion', () => {
	test('(f) index.md is excluded from pages', () => {
		mkdirSync(join(docs, 'section'));
		writeFileSync(join(docs, 'section', 'index.md'), '# Section Home\n');
		writeFileSync(join(docs, 'section', 'other.md'), '# Other Page\n');

		const scan = makeScan(
			docs,
			[],
			[join(docs, 'section', 'index.md'), join(docs, 'section', 'other.md')],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);

		const result = recipe.apply!(findings[0], '');
		const meta = parseDirMetaFromString(result);

		expect(meta!.pages).toBeDefined();
		expect(Object.keys(meta!.pages!)).not.toContain('index');
		expect(Object.keys(meta!.pages!)).toContain('other');
	});

	test('(f) directory with ONLY index.md → finding emitted but pages absent', () => {
		mkdirSync(join(docs, 'landing'));
		writeFileSync(join(docs, 'landing', 'index.md'), '# Landing\n');

		const scan = makeScan(docs, [], [join(docs, 'landing', 'index.md')]);
		const findings = recipe.detect(scan, new Map());
		// A finding IS emitted (dir has .md but no _meta.yaml)
		expect(findings.length).toBe(1);

		const result = recipe.apply!(findings[0], '');
		const meta = parseDirMetaFromString(result);
		// pages absent when nothing to register
		expect(meta!.pages).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// (g) docsDir root is skipped
// ---------------------------------------------------------------------------

describe('detect — docsDir root skipped', () => {
	test('(g) docsDir root with .md but no _meta.yaml is skipped', () => {
		writeFileSync(join(docs, 'readme.md'), '# Readme\n');

		const scan = makeScan(docs, [], [join(docs, 'readme.md')]);
		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(0);
	});

	test('(g) subdirectory still gets a finding even when root also has .md', () => {
		writeFileSync(join(docs, 'readme.md'), '# Readme\n');
		mkdirSync(join(docs, 'sub'));
		writeFileSync(join(docs, 'sub', 'page.md'), '# Page\n');

		const scan = makeScan(
			docs,
			[],
			[join(docs, 'readme.md'), join(docs, 'sub', 'page.md')],
		);
		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);
		expect(findings[0].payload?.dirPath).toBe(join(docs, 'sub'));
	});
});

// ---------------------------------------------------------------------------
// (h) roundtrip: dumped content is valid YAML and roundtrips
// ---------------------------------------------------------------------------

describe('apply — YAML validity and roundtrip', () => {
	test('(h) dumped content is valid YAML and roundtrips through parseDirMetaFromString', () => {
		mkdirSync(join(docs, 'roundtrip'));
		writeFileSync(join(docs, 'roundtrip', 'alpha.md'), '# Alpha Page\n');
		writeFileSync(join(docs, 'roundtrip', 'beta.md'), '# Beta: A Guide\n');
		writeFileSync(join(docs, 'roundtrip', 'gamma.md'), 'No heading\n');

		const scan = makeScan(
			docs,
			[],
			[
				join(docs, 'roundtrip', 'alpha.md'),
				join(docs, 'roundtrip', 'beta.md'),
				join(docs, 'roundtrip', 'gamma.md'),
			],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);

		const dumped = recipe.apply!(findings[0], '');

		expect(typeof dumped).toBe('string');
		expect(dumped.endsWith('\n')).toBe(true);

		const reparsed = parseDirMetaFromString(dumped);
		expect(reparsed).not.toBeNull();
		expect(reparsed!.title).toBe('roundtrip');

		const keys = Object.keys(reparsed!.pages ?? {});
		expect(keys).toEqual(['alpha', 'beta', 'gamma']);
		expect(reparsed!.pages!['alpha'].title).toBe('Alpha Page');
		// 'Beta: A Guide' contains ': ' → needs quoting → still roundtrips
		expect(reparsed!.pages!['beta'].title).toBe('Beta: A Guide');
		// fallback to basename
		expect(reparsed!.pages!['gamma'].title).toBe('gamma');
	});

	test('(h) idempotent: detect emits no finding once _meta.yaml exists', () => {
		mkdirSync(join(docs, 'idem'));
		writeFileSync(join(docs, 'idem', 'page.md'), '# Page\n');

		const scan1 = makeScan(docs, [], [join(docs, 'idem', 'page.md')]);
		const findings1 = recipe.detect(scan1, new Map());
		expect(findings1.length).toBe(1);

		// Simulate writing the scaffolded file
		const content = recipe.apply!(findings1[0], '');
		writeFileSync(join(docs, 'idem', '_meta.yaml'), content);

		// Re-scan with the new file present
		const scan2 = makeScan(
			docs,
			[join(docs, 'idem', '_meta.yaml')],
			[join(docs, 'idem', 'page.md')],
		);
		const findings2 = recipe.detect(scan2, new Map());
		expect(findings2.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// multiple directories
// ---------------------------------------------------------------------------

describe('detect — multiple directories', () => {
	test('two dirs missing _meta.yaml → two findings', () => {
		mkdirSync(join(docs, 'dir-a'));
		mkdirSync(join(docs, 'dir-b'));
		writeFileSync(join(docs, 'dir-a', 'page.md'), '# Page A\n');
		writeFileSync(join(docs, 'dir-b', 'page.md'), '# Page B\n');

		const scan = makeScan(
			docs,
			[],
			[join(docs, 'dir-a', 'page.md'), join(docs, 'dir-b', 'page.md')],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(2);

		const dirs = findings.map((f) => basename(f.payload!.dirPath)).sort();
		expect(dirs).toEqual(['dir-a', 'dir-b']);

		for (const f of findings) {
			expect(f.payload?.isNewFile).toBe(true);
		}
	});

	test('one dir has _meta.yaml, other does not → one finding', () => {
		mkdirSync(join(docs, 'has-meta'));
		mkdirSync(join(docs, 'no-meta'));
		writeFileSync(join(docs, 'has-meta', 'page.md'), '# Page\n');
		writeFileSync(join(docs, 'has-meta', '_meta.yaml'), 'title: HasMeta\n');
		writeFileSync(join(docs, 'no-meta', 'page.md'), '# Page\n');

		const scan = makeScan(
			docs,
			[join(docs, 'has-meta', '_meta.yaml')],
			[join(docs, 'has-meta', 'page.md'), join(docs, 'no-meta', 'page.md')],
		);

		const findings = recipe.detect(scan, new Map());
		expect(findings.length).toBe(1);
		expect(findings[0].payload?.dirPath).toBe(join(docs, 'no-meta'));
	});
});

// ---------------------------------------------------------------------------
// dir title verbatim (no transformation)
// ---------------------------------------------------------------------------

describe('apply — title verbatim', () => {
	test('kebab-case basename is NOT converted to Title Case', () => {
		mkdirSync(join(docs, 'my-cool-section'));
		writeFileSync(join(docs, 'my-cool-section', 'page.md'), '# Page\n');

		const scan = makeScan(docs, [], [join(docs, 'my-cool-section', 'page.md')]);
		const findings = recipe.detect(scan, new Map());
		const result = recipe.apply!(findings[0], '');

		const meta = parseDirMetaFromString(result);
		expect(meta!.title).toBe('my-cool-section');
	});

	test('Chinese-named dir has title verbatim', () => {
		mkdirSync(join(docs, '指南'));
		writeFileSync(join(docs, '指南', 'page.md'), '# 页面\n');

		const scan = makeScan(docs, [], [join(docs, '指南', 'page.md')]);
		const findings = recipe.detect(scan, new Map());
		const result = recipe.apply!(findings[0], '');

		const meta = parseDirMetaFromString(result);
		expect(meta!.title).toBe('指南');
	});
});
