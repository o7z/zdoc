import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './normalize-frontmatter-keys.ts';
import type { DocsScan } from '../types.ts';

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-frontmatter-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function runRecipe(source: string): string {
	const metaFile = join(docs, '_meta.yaml');
	writeFileSync(metaFile, source);
	const sources = new Map<string, string>([[metaFile, source]]);
	const scan: DocsScan = { docsDir: docs, metaFiles: [metaFile], mdFiles: new Set() };
	const findings = recipe.detect(scan, sources);
	if (findings.length === 0) return source;
	return recipe.apply!(findings[0], source);
}

describe('normalize-frontmatter-keys', () => {
	test('typo "desc" on a child entry → renamed to description', () => {
		const out = runRecipe(
			`title: T\nchildren:\n  - name: foo\n    title: Foo\n    desc: hello\n`,
		);
		expect(out).toContain('description: hello');
		expect(out).not.toContain('desc: hello');
	});

	test('typo "modifed" → modified on pages.* entry', () => {
		const out = runRecipe(
			`title: T\npages:\n  foo:\n    title: Foo\n    modifed: 2026-04-21\n`,
		);
		expect(out).toContain('modified: 2026-04-21');
		expect(out).not.toContain('modifed:');
	});

	test('typo + canonical both present → canonical wins, no rewrite of typo', () => {
		const source = `title: T\nchildren:\n  - name: foo\n    title: Foo\n    desc: typo-val\n    description: real-val\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const scan: DocsScan = { docsDir: docs, metaFiles: [join(docs, '_meta.yaml')], mdFiles: new Set() };
		// detect skips when canonical already present
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(0);
	});

	test('unknown typos not in whitelist → no finding', () => {
		const source = `title: T\nchildren:\n  - name: foo\n    title: Foo\n    weirdkey: val\n`;
		writeFileSync(join(docs, '_meta.yaml'), source);
		const sources = new Map<string, string>([[join(docs, '_meta.yaml'), source]]);
		const scan: DocsScan = { docsDir: docs, metaFiles: [join(docs, '_meta.yaml')], mdFiles: new Set() };
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(0);
	});
});
