import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanLegacyHits, printLegacySchemaBannerIfNeeded } from './legacy-banner.ts';

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-banner-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string) {
	writeFileSync(join(dir, '_meta.yaml'), body);
}

describe('scanLegacyHits', () => {
	test('clean v2 doc → no hits', () => {
		writeMeta(docs, `title: T\nchildren:\n  - name: foo\n    title: Foo\n`);
		expect(scanLegacyHits(docs)).toEqual([]);
	});

	test('pages-only doc → 1 pages hit', () => {
		writeMeta(docs, `title: T\npages:\n  foo:\n    title: Foo\n`);
		const hits = scanLegacyHits(docs);
		expect(hits.length).toBe(1);
		expect(hits[0].kind).toBe('pages');
	});

	test('env at top + pages.x + children[y] → 3 env hits', () => {
		writeMeta(
			docs,
			`title: T\nenv: prod\npages:\n  a:\n    title: A\n    env: prod\nchildren:\n  - name: b\n    title: B\n    env: prod\n`,
		);
		const hits = scanLegacyHits(docs);
		const envHits = hits.filter((h) => h.kind === 'env');
		expect(envHits.length).toBe(3);
		// pages: also triggers
		expect(hits.some((h) => h.kind === 'pages')).toBe(true);
	});

	test('walks subdirs', () => {
		writeMeta(docs, `title: Root\nchildren:\n  - name: sub\n`);
		const sub = join(docs, 'sub');
		mkdirSync(sub);
		writeMeta(sub, `title: Sub\npages:\n  foo:\n    title: Foo\n`);
		const hits = scanLegacyHits(docs);
		expect(hits.length).toBe(1);
		expect(hits[0].file).toContain('sub');
		expect(hits[0].kind).toBe('pages');
	});

	test('malformed YAML is silently skipped (lint reports separately)', () => {
		writeMeta(docs, `:::invalid yaml:::`);
		expect(scanLegacyHits(docs)).toEqual([]);
	});
});

describe('printLegacySchemaBannerIfNeeded', () => {
	let captured: string;
	const origWrite = process.stderr.write.bind(process.stderr);

	beforeEach(() => {
		captured = '';
		process.stderr.write = ((s: string | Uint8Array) => {
			captured += typeof s === 'string' ? s : Buffer.from(s).toString();
			return true;
		}) as typeof process.stderr.write;
	});
	afterEach(() => {
		process.stderr.write = origWrite;
	});

	test('clean docs → no banner output, returns false', () => {
		writeMeta(docs, `title: T\nchildren:\n  - name: foo\n    title: Foo\n`);
		const printed = printLegacySchemaBannerIfNeeded(docs);
		expect(printed).toBe(false);
		expect(captured).toBe('');
	});

	test('pages-only docs → banner mentions pages and fix command', () => {
		writeMeta(docs, `title: T\npages:\n  foo:\n    title: Foo\n`);
		const printed = printLegacySchemaBannerIfNeeded(docs);
		expect(printed).toBe(true);
		expect(captured).toContain('v2 schema 迁移');
		expect(captured).toContain('pages:');
		expect(captured).toContain('zdoc fix --recipe=pages-to-children');
		expect(captured).toContain('不自动改盘');
	});

	test('env-only docs → banner mentions env-to-visibility command', () => {
		writeMeta(docs, `title: T\nchildren:\n  - name: foo\n    title: Foo\n    env: prod\n`);
		const printed = printLegacySchemaBannerIfNeeded(docs);
		expect(printed).toBe(true);
		expect(captured).toContain('env:');
		expect(captured).toContain('zdoc fix --recipe=env-to-visibility');
	});
});
