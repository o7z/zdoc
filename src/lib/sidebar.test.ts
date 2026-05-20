import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSidebar, clearSidebarCache } from './sidebar.js';

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-sidebar-test-'));
	clearSidebarCache();
});

afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
	clearSidebarCache();
});

function writeMeta(dir: string, body: string) {
	writeFileSync(join(dir, '_meta.yaml'), body);
}

function writeMd(path: string, body: string) {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body);
}

describe('buildSidebar — children: list schema', () => {
	test('renders children entries in list order (implicit position-based order)', () => {
		writeMeta(
			docs,
			`title: Site\nchildren:\n  - name: c\n    title: C\n  - name: a\n    title: A\n  - name: b\n    title: B\n`,
		);
		writeMd(join(docs, 'a.md'), '# A\n');
		writeMd(join(docs, 'b.md'), '# B\n');
		writeMd(join(docs, 'c.md'), '# C\n');

		const result = buildSidebar(docs);
		expect(result.map((g) => g.text)).toEqual(['C', 'A', 'B']);
	});

	test('children entry with visibility: prod-only is hidden in dev', () => {
		writeMeta(
			docs,
			`children:\n  - name: public-page\n    title: Public\n  - name: marketing\n    title: Marketing\n    visibility: prod-only\n`,
		);
		writeMd(join(docs, 'public-page.md'), '# Public\n');
		writeMd(join(docs, 'marketing.md'), '# Marketing\n');

		const result = buildSidebar(docs);
		expect(result.map((g) => g.text)).toEqual(['Public']);
	});

	test('explicit order on a child entry overrides positional order', () => {
		writeMeta(
			docs,
			`children:\n  - name: first\n    title: First\n  - name: pinned\n    title: Pinned\n    order: 5\n  - name: third\n    title: Third\n`,
		);
		writeMd(join(docs, 'first.md'), '# First\n');
		writeMd(join(docs, 'pinned.md'), '# Pinned\n');
		writeMd(join(docs, 'third.md'), '# Third\n');

		const result = buildSidebar(docs);
		// Pinned (order=5) ahead of First (order=10) and Third (order=30)
		expect(result.map((g) => g.text)).toEqual(['Pinned', 'First', 'Third']);
	});

	test('child entry whose .md is missing is silently skipped', () => {
		writeMeta(
			docs,
			`children:\n  - name: real\n    title: Real\n  - name: ghost\n    title: Ghost\n`,
		);
		writeMd(join(docs, 'real.md'), '# Real\n');
		// ghost.md intentionally not created

		const result = buildSidebar(docs);
		expect(result.map((g) => g.text)).toEqual(['Real']);
	});
});

describe('buildSidebar — visibility: prod-only equivalence with env: prod', () => {
	test('env: prod entry is hidden in dev (legacy v1 behavior preserved)', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  shown:\n    title: Shown\n  hidden:\n    title: Hidden\n    env: prod\n`,
		);
		writeMd(join(docs, 'shown.md'), '# Shown\n');
		writeMd(join(docs, 'hidden.md'), '# Hidden\n');

		const result = buildSidebar(docs);
		expect(result.map((g) => g.text)).toEqual(['Shown']);
	});

	test('visibility: prod-only on a pages entry is hidden in dev', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  shown:\n    title: Shown\n  hidden:\n    title: Hidden\n    visibility: prod-only\n`,
		);
		writeMd(join(docs, 'shown.md'), '# Shown\n');
		writeMd(join(docs, 'hidden.md'), '# Hidden\n');

		const result = buildSidebar(docs);
		expect(result.map((g) => g.text)).toEqual(['Shown']);
	});

	test('top-level visibility: prod-only hides whole subdir in dev', () => {
		const sub = join(docs, 'internal');
		mkdirSync(sub);
		writeMeta(sub, `title: Internal\nvisibility: prod-only\n`);
		writeMd(join(sub, 'page.md'), '# Page\n');
		// docs root has no _meta.yaml — that's fine for the test
		writeMeta(docs, `title: Root\n`);

		const result = buildSidebar(docs);
		// Internal subdir hidden, root has no listed pages → empty
		expect(result.length).toBe(0);
	});
});

describe('buildSidebar — pages + children coexistence', () => {
	test('when both pages and children present, children take priority', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: LegacyOnly\nchildren:\n  - name: modern\n    title: ModernOnly\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		writeMd(join(docs, 'modern.md'), '# Modern\n');

		const result = buildSidebar(docs);
		// children wins; pages entries are ignored
		expect(result.map((g) => g.text)).toEqual(['ModernOnly']);
	});
});

describe('buildSidebar — children subdir entries defer to 自发现', () => {
	test('a subdir name in children is not double-listed', () => {
		// root: only the subdir lives here (via children entry)
		writeMeta(
			docs,
			`title: Site\nchildren:\n  - name: guide\n`,
		);
		// subdir has its own _meta.yaml — 自发现 will surface it
		const sub = join(docs, 'guide');
		mkdirSync(sub);
		writeMeta(sub, `title: GuideSection\norder: 10\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(sub, 'intro.md'), '# Intro\n');

		const result = buildSidebar(docs);
		// Should appear exactly once
		const guideEntries = result.filter((g) => g.text === 'GuideSection');
		expect(guideEntries.length).toBe(1);
		// And its children should be the subdir's intro page
		expect(guideEntries[0].items?.[0].text).toBe('Intro');
	});
});
