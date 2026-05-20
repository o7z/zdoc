import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './pages-to-children.ts';
import type { DocsScan, Finding } from '../types.ts';

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-p2c-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string) {
	writeFileSync(join(dir, '_meta.yaml'), body);
}

function makeScan(sources: Map<string, string>): DocsScan {
	return {
		docsDir: docs,
		metaFiles: [...sources.keys()],
		mdFiles: new Set(),
	};
}

function runRecipe(metaSource: string, metaFileOverride?: string): string {
	const metaFile = metaFileOverride ?? join(docs, '_meta.yaml');
	writeFileSync(metaFile, metaSource);
	const sources = new Map<string, string>([[metaFile, metaSource]]);
	const scan = makeScan(sources);
	const findings = recipe.detect(scan, sources);
	if (findings.length === 0) return metaSource; // no-op
	return recipe.apply!(findings[0], metaSource);
}

describe('pages-to-children — detect', () => {
	test('triggers when pages: exists', () => {
		const metaFile = join(docs, '_meta.yaml');
		const source = `title: T\npages:\n  foo:\n    title: Foo\n`;
		writeFileSync(metaFile, source);
		const findings = recipe.detect(makeScan(new Map([[metaFile, source]])), new Map([[metaFile, source]]));
		expect(findings.length).toBe(1);
		expect(findings[0].recipeId).toBe('pages-to-children');
		expect(findings[0].file).toBe(metaFile);
	});

	test('does NOT trigger when only children: present', () => {
		const metaFile = join(docs, '_meta.yaml');
		const source = `title: T\nchildren:\n  - name: foo\n    title: Foo\n`;
		writeFileSync(metaFile, source);
		const findings = recipe.detect(makeScan(new Map([[metaFile, source]])), new Map([[metaFile, source]]));
		expect(findings.length).toBe(0);
	});

	test('triggers when both pages and children present (mid-migration)', () => {
		const metaFile = join(docs, '_meta.yaml');
		const source =
			`pages:\n  a:\n    title: A\nchildren:\n  - name: b\n    title: B\n`;
		writeFileSync(metaFile, source);
		const findings = recipe.detect(makeScan(new Map([[metaFile, source]])), new Map([[metaFile, source]]));
		expect(findings.length).toBe(1);
	});
});

describe('pages-to-children — apply', () => {
	test('basic translation preserves entries and drops order', () => {
		const out = runRecipe(
			`title: Authoring\npages:\n  meta-yaml:\n    title: _meta.yaml\n    order: 10\n  page-fields:\n    title: Page fields\n    order: 20\n`,
		);
		expect(out).toBe(
			'title: Authoring\n' +
				'children:\n' +
				'  - name: meta-yaml\n' +
				'    title: _meta.yaml\n' +
				'  - name: page-fields\n' +
				'    title: Page fields\n',
		);
	});

	test('order field determines stable sort; ties break by key', () => {
		const out = runRecipe(
			`pages:\n  b:\n    title: B\n    order: 10\n  a:\n    title: A\n    order: 10\n  c:\n    title: C\n    order: 5\n`,
		);
		// c (order=5) first, then a/b (both order=10) by key alphabetical
		const childrenLines = out.split('\n').filter((l) => l.startsWith('  - name:'));
		expect(childrenLines).toEqual(['  - name: c', '  - name: a', '  - name: b']);
	});

	test('entries without order use default 999 (placed after explicit-order entries)', () => {
		const out = runRecipe(
			`pages:\n  pinned:\n    title: Pinned\n    order: 5\n  drifting:\n    title: Drifting\n`,
		);
		const childrenLines = out.split('\n').filter((l) => l.startsWith('  - name:'));
		expect(childrenLines).toEqual(['  - name: pinned', '  - name: drifting']);
	});

	test('preserves visibility, description, lifecycle on migrated entries', () => {
		const out = runRecipe(
			`pages:\n  foo:\n    title: Foo\n    order: 10\n    visibility: prod-only\n    description: Hello\n    lifecycle: stable\n`,
		);
		expect(out).toContain('  - name: foo');
		expect(out).toContain('    title: Foo');
		expect(out).toContain('    visibility: prod-only');
		expect(out).toContain('    description: Hello');
		expect(out).toContain('    lifecycle: stable');
		// order should NOT appear in children entries
		expect(out).not.toContain('    order:');
	});

	test('self-discovered subdir gets merged into children (interleaved by order+name)', () => {
		// Parent uses pages: intro (no order); subdir guide has its own
		// _meta.yaml (no order). Both default to order=999 → sorted by name:
		// guide < intro, so guide ends up first.
		writeMeta(docs, `title: Parent\npages:\n  intro:\n    title: Intro\n`);
		const sub = join(docs, 'guide');
		mkdirSync(sub);
		writeMeta(sub, `title: Guide\n`);

		const metaFile = join(docs, '_meta.yaml');
		const source = `title: Parent\npages:\n  intro:\n    title: Intro\n`;
		const out = runRecipe(source, metaFile);

		// Both entries present
		expect(out).toContain('  - name: intro');
		expect(out).toContain('  - name: guide');
		// guide should have no title field (subdir entry — title lives in subdir's own _meta.yaml)
		const guideIdx = out.indexOf('  - name: guide');
		const nextItemIdx = out.indexOf('  - name:', guideIdx + 1);
		const guideBlock = nextItemIdx > 0 ? out.slice(guideIdx, nextItemIdx) : out.slice(guideIdx);
		expect(guideBlock).not.toContain('    title:');
	});

	test('pages and subdirs merge by order+name (v1 sidebar parity)', () => {
		writeMeta(docs, `pages:\n  alpha:\n    title: Alpha\n    order: 30\n  zeta:\n    title: Zeta\n    order: 5\n`);
		// Subdir 'middle' with order=10
		const sub = join(docs, 'middle');
		mkdirSync(sub);
		writeMeta(sub, `title: Middle\norder: 10\n`);
		writeFileSync(join(docs, 'alpha.md'), '# Alpha\n');
		writeFileSync(join(docs, 'zeta.md'), '# Zeta\n');

		const out = runRecipe(
			`pages:\n  alpha:\n    title: Alpha\n    order: 30\n  zeta:\n    title: Zeta\n    order: 5\n`,
			join(docs, '_meta.yaml'),
		);
		// Expected order: zeta(5), middle(10), alpha(30)
		const names = out
			.split('\n')
			.filter((l) => l.startsWith('  - name:'))
			.map((l) => l.replace('  - name: ', '').trim());
		expect(names).toEqual(['zeta', 'middle', 'alpha']);
	});

	test('subdir without _meta.yaml is NOT appended', () => {
		writeMeta(docs, `pages:\n  intro:\n    title: Intro\n`);
		mkdirSync(join(docs, 'assets')); // no _meta.yaml inside

		const out = runRecipe(`pages:\n  intro:\n    title: Intro\n`, join(docs, '_meta.yaml'));
		expect(out).not.toContain('  - name: assets');
	});

	test('mid-migration: existing children take priority over same-name pages entry', () => {
		const source =
			`pages:\n  foo:\n    title: OldFoo\nchildren:\n  - name: foo\n    title: NewFoo\n`;
		const out = runRecipe(source);
		// children's foo wins; pages' OldFoo dropped
		expect(out).toContain('    title: NewFoo');
		expect(out).not.toContain('OldFoo');
		// Only one entry for 'foo'
		const fooCount = (out.match(/- name: foo/g) ?? []).length;
		expect(fooCount).toBe(1);
	});

	test('empty pages map → case 2 fires; children gains self-discovered subdir', () => {
		writeMeta(docs, `title: T\npages:\n`);
		const sub = join(docs, 'inner');
		mkdirSync(sub);
		writeMeta(sub, `title: Inner\n`);

		// `pages:` with no entries is parsed as null → meta.pages is undefined.
		// With v1.18's case-2 detect, the title-only + self-discovered subdir
		// scenario triggers a finding and the inner subdir is registered.
		const source = `title: T\npages:\n`;
		const out = runRecipe(source, join(docs, '_meta.yaml'));
		expect(out).toContain('title: T');
		expect(out).toContain('children:');
		expect(out).toContain('  - name: inner');
	});

	test('idempotent: post-migration source produces no finding, apply is no-op', () => {
		// First run migrates to children
		const original = `pages:\n  foo:\n    title: Foo\n    order: 10\n`;
		const migrated = runRecipe(original);
		expect(migrated).toContain('children:');
		expect(migrated).not.toContain('pages:');

		// Second run on migrated source should find no findings
		const metaFile = join(docs, '_meta.yaml');
		writeFileSync(metaFile, migrated);
		const findings = recipe.detect(
			makeScan(new Map([[metaFile, migrated]])),
			new Map([[metaFile, migrated]]),
		);
		expect(findings.length).toBe(0);
	});

	test('top-level fields preserved (title, order, env, visibility)', () => {
		const out = runRecipe(
			`title: Top\norder: 5\nenv: prod\npages:\n  a:\n    title: A\n`,
		);
		expect(out).toContain('title: Top');
		expect(out).toContain('order: 5');
		expect(out).toContain('env: prod');
		expect(out).not.toContain('pages:');
		expect(out).toContain('children:');
	});

	// v1.18 addition: title-only parent + self-discovered subdirs → register them.
	test('title-only parent with self-discovered subdirs registers them as children', () => {
		writeMeta(docs, `title: Guide\norder: 10\n`);
		// Three subdirs each with their own _meta.yaml
		for (const name of ['intro', 'authoring', 'advanced']) {
			const sub = join(docs, name);
			mkdirSync(sub);
			writeMeta(sub, `title: ${name}\n`);
		}

		const out = runRecipe(`title: Guide\norder: 10\n`, join(docs, '_meta.yaml'));
		expect(out).toContain('title: Guide');
		expect(out).toContain('children:');
		// All three subdirs registered (lexicographic order from listSubdirsWithMeta)
		expect(out).toContain('  - name: advanced');
		expect(out).toContain('  - name: authoring');
		expect(out).toContain('  - name: intro');
	});

	test('title-only parent without subdirs is a no-op (no finding, no change)', () => {
		writeMeta(docs, `title: Solo\n`);
		const source = `title: Solo\n`;
		const out = runRecipe(source);
		// No finding → runRecipe returns the original source unchanged
		expect(out).toBe(source);
	});
});
