import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './env-to-visibility.ts';
import type { DocsScan } from '../types.ts';

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-e2v-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function makeScan(sources: Map<string, string>): DocsScan {
	return { docsDir: docs, metaFiles: [...sources.keys()], mdFiles: new Set() };
}

function runRecipe(source: string): string {
	const metaFile = join(docs, '_meta.yaml');
	writeFileSync(metaFile, source);
	const sources = new Map<string, string>([[metaFile, source]]);
	const findings = recipe.detect(makeScan(sources), sources);
	if (findings.length === 0) return source;
	return recipe.apply!(findings[0], source);
}

describe('env-to-visibility — detect', () => {
	test('triggers on top-level env:', () => {
		const source = `title: T\nenv: prod\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const findings = recipe.detect(makeScan(sources), sources);
		expect(findings.length).toBe(1);
	});

	test('triggers on pages.* env:', () => {
		const source = `pages:\n  foo:\n    title: Foo\n    env: prod\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const findings = recipe.detect(makeScan(sources), sources);
		expect(findings.length).toBe(1);
	});

	test('triggers on children[] env:', () => {
		const source = `children:\n  - name: foo\n    title: Foo\n    env: prod\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const findings = recipe.detect(makeScan(sources), sources);
		expect(findings.length).toBe(1);
	});

	test('does NOT trigger when only visibility: present', () => {
		const source = `pages:\n  foo:\n    title: Foo\n    visibility: prod-only\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const findings = recipe.detect(makeScan(sources), sources);
		expect(findings.length).toBe(0);
	});

	test('one finding per file even when multiple env: locations', () => {
		const source =
			`env: prod\npages:\n  a:\n    title: A\n    env: prod\n  b:\n    title: B\n    env: prod\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const findings = recipe.detect(makeScan(sources), sources);
		expect(findings.length).toBe(1);
	});
});

describe('env-to-visibility — apply', () => {
	test('top-level env: prod → visibility: prod-only', () => {
		const out = runRecipe(`title: Internal\nenv: prod\n`);
		expect(out).toContain('visibility: prod-only');
		expect(out).not.toContain('env: prod');
		expect(out).not.toContain('env:');
	});

	test('pages.* env: prod → visibility: prod-only', () => {
		const out = runRecipe(
			`pages:\n  marketing:\n    title: Marketing\n    env: prod\n`,
		);
		expect(out).toContain('    visibility: prod-only');
		expect(out).not.toContain('    env:');
	});

	test('children[] env: prod → visibility: prod-only', () => {
		const out = runRecipe(
			`children:\n  - name: marketing\n    title: Marketing\n    env: prod\n`,
		);
		expect(out).toContain('    visibility: prod-only');
		expect(out).not.toContain('    env:');
	});

	test('all three positions migrated in a single pass', () => {
		const out = runRecipe(
			`env: prod\npages:\n  a:\n    title: A\n    env: prod\nchildren:\n  - name: b\n    title: B\n    env: prod\n`,
		);
		// Count visibility occurrences: top + pages.a + children[0] = 3
		const visCount = (out.match(/visibility: prod-only/g) ?? []).length;
		expect(visCount).toBe(3);
		expect(out).not.toContain('env:');
	});

	test('visibility already set → preserve visibility, delete env', () => {
		const out = runRecipe(
			`pages:\n  foo:\n    title: Foo\n    env: prod\n    visibility: dev-only\n`,
		);
		// Existing visibility wins
		expect(out).toContain('visibility: dev-only');
		expect(out).not.toContain('visibility: prod-only');
		// env: gone
		expect(out).not.toContain('env:');
	});

	test('non-prod env values are renamed verbatim', () => {
		const out = runRecipe(`env: staging\n`);
		expect(out).toContain('visibility: staging');
		expect(out).not.toContain('env:');
	});

	test('idempotent: re-running on already-migrated source yields no findings', () => {
		const original = `pages:\n  foo:\n    title: Foo\n    env: prod\n`;
		const migrated = runRecipe(original);
		// Re-run: detect should yield nothing
		const sources2 = new Map<string, string>([[join(docs, '_meta.yaml'), migrated]]);
		const findings2 = recipe.detect(makeScan(sources2), sources2);
		expect(findings2.length).toBe(0);
	});

	test('preserves untouched fields (title, order, description, lifecycle)', () => {
		const out = runRecipe(
			`title: T\norder: 5\npages:\n  foo:\n    title: Foo\n    env: prod\n    description: Hello\n    lifecycle: stable\n`,
		);
		expect(out).toContain('title: T');
		expect(out).toContain('order: 5');
		expect(out).toContain('    title: Foo');
		expect(out).toContain('    description: Hello');
		expect(out).toContain('    lifecycle: stable');
	});
});
