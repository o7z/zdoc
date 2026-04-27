import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkDocs, flattenPages, filterByLifecycle } from './docs-walker.ts';

let docs: string;
beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-walker-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string) {
	writeFileSync(join(dir, '_meta.yaml'), body);
}
function writeMd(path: string, body: string) {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body);
}

describe('walkDocs', () => {
	test('returns null for non-existent dir', () => {
		expect(walkDocs(join(docs, 'nope'))).toBeNull();
	});

	test('returns null when root has no _meta.yaml', () => {
		expect(walkDocs(docs)).toBeNull();
	});

	test('returns tree with pages and child dirs', () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n    order: 1\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeMeta(join(docs, 'sub'), `title: Sub\npages:\n  inner:\n    title: Inner\n`);
		writeMd(join(docs, 'sub', 'inner.md'), '# Inner\n');
		const root = walkDocs(docs);
		expect(root?.title).toBe('Site');
		expect(root?.pages.length).toBe(1);
		expect(root?.children.length).toBe(1);
		expect(root?.children[0].title).toBe('Sub');
		expect(root?.children[0].pages[0].title).toBe('Inner');
	});

	test('lifecycle / superseded_by / folded_to are propagated to PageEntry', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\n    lifecycle: archived\n    superseded_by: /current.md\n  current:\n    title: Current\n  research:\n    title: Research\n    folded_to: /current.md#schema\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		writeMd(join(docs, 'current.md'), '# Current\n');
		writeMd(join(docs, 'research.md'), '# Research\n');
		const root = walkDocs(docs);
		const all = flattenPages(root!);
		const legacy = all.find((p) => p.title === 'Legacy');
		expect(legacy?.lifecycle).toBe('archived');
		expect(legacy?.superseded_by).toBe('/current.md');
		const research = all.find((p) => p.title === 'Research');
		expect(research?.folded_to).toBe('/current.md#schema');
	});

	test('parentDirTitles records breadcrumb chain', () => {
		writeMeta(docs, `title: Site\n`);
		mkdirSync(join(docs, 'guide'), { recursive: true });
		writeMeta(join(docs, 'guide'), `title: Guide\n`);
		mkdirSync(join(docs, 'guide', 'intro'), { recursive: true });
		writeMeta(join(docs, 'guide', 'intro'), `title: Intro\npages:\n  install:\n    title: Install\n`);
		writeMd(join(docs, 'guide', 'intro', 'install.md'), '# Install\n');
		const root = walkDocs(docs);
		const all = flattenPages(root!);
		const install = all.find((p) => p.title === 'Install');
		expect(install?.parentDirTitles).toEqual(['Site', 'Guide', 'Intro']);
	});

	test('pages without title are skipped', () => {
		writeMeta(docs, `title: Site\npages:\n  hidden:\n    order: 1\n  shown:\n    title: Shown\n`);
		writeMd(join(docs, 'hidden.md'), '# Hidden\n');
		writeMd(join(docs, 'shown.md'), '# Shown\n');
		const root = walkDocs(docs);
		expect(root?.pages.length).toBe(1);
		expect(root?.pages[0].title).toBe('Shown');
	});

	test('page entries missing on disk are dropped', () => {
		writeMeta(docs, `title: Site\npages:\n  ghost:\n    title: Ghost\n  real:\n    title: Real\n`);
		writeMd(join(docs, 'real.md'), '# Real\n');
		const root = walkDocs(docs);
		expect(root?.pages.length).toBe(1);
		expect(root?.pages[0].title).toBe('Real');
	});
});

describe('filterByLifecycle', () => {
	const seed = () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  d:\n    title: D\n    lifecycle: draft\n  s:\n    title: S\n    lifecycle: stable\n  a:\n    title: A\n    lifecycle: archived\n  n:\n    title: N\n`,
		);
		for (const k of ['d', 's', 'a', 'n']) writeMd(join(docs, `${k}.md`), `# ${k}\n`);
		return flattenPages(walkDocs(docs)!);
	};

	test('default: excludes archived, keeps draft/stable/no-lifecycle', () => {
		const out = filterByLifecycle(seed());
		const titles = out.map((p) => p.title).sort();
		expect(titles).toEqual(['D', 'N', 'S']);
	});

	test('includeArchived: true keeps archived', () => {
		const out = filterByLifecycle(seed(), { includeArchived: true });
		expect(out.find((p) => p.title === 'A')).toBeDefined();
	});

	test('lifecycle: "stable" returns stable pages and pages with no lifecycle', () => {
		const out = filterByLifecycle(seed(), { lifecycle: 'stable' });
		const titles = out.map((p) => p.title).sort();
		expect(titles).toEqual(['N', 'S']);
	});

	test('lifecycle: "draft" stays strict — no-lifecycle pages excluded', () => {
		const out = filterByLifecycle(seed(), { lifecycle: 'draft' });
		expect(out.length).toBe(1);
		expect(out[0].title).toBe('D');
	});

	test('lifecycle: "archived" + includeArchived: true returns only archived', () => {
		const out = filterByLifecycle(seed(), { lifecycle: 'archived', includeArchived: true });
		expect(out.length).toBe(1);
		expect(out[0].title).toBe('A');
	});
});
