import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import recipe from './normalize-link-suffix.ts';
import type { DocsScan } from '../types.ts';

let docs: string;

beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-link-suffix-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function makeScan(mdFiles: string[]): { scan: DocsScan; sources: Map<string, string> } {
	const sources = new Map<string, string>();
	for (const f of mdFiles) {
		sources.set(f, readFileSync(f, 'utf-8'));
	}
	return {
		scan: { docsDir: docs, metaFiles: [], mdFiles: new Set(mdFiles) },
		sources,
	};
}

describe('normalize-link-suffix — detect', () => {
	test('auto-fix single candidate: only foo.md exists', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\nSee [foo](/foo).\n');

		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(1);
		expect(findings[0].manualReview).toBeUndefined();
		expect(findings[0].payload?.suggested).toBe('/foo.md');
	});

	test('manualReview when both foo.md and foo.pdf exist', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		writeFileSync(join(docs, 'foo.pdf'), 'fake pdf');
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\nSee [foo](/foo).\n');

		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(1);
		expect(findings[0].manualReview).toBe(true);
		expect(findings[0].message).toContain('foo.md');
		expect(findings[0].message).toContain('foo.pdf');
	});

	test('no candidate → no finding (broken link, internal-link lint handles it)', () => {
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\nSee [missing](/missing).\n');
		const { scan, sources } = makeScan([pagePath]);
		expect(recipe.detect(scan, sources)).toEqual([]);
	});

	test('already-suffixed link is not touched', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\nSee [foo](/foo.md).\n');
		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		expect(recipe.detect(scan, sources)).toEqual([]);
	});

	test('external links (http/mailto) ignored', () => {
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\n[ext](https://x.com) [m](mailto:a@b.com)\n');
		const { scan, sources } = makeScan([pagePath]);
		expect(recipe.detect(scan, sources)).toEqual([]);
	});

	test('same-page anchor (#sec) ignored', () => {
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\n[anchor](#sec)\n');
		const { scan, sources } = makeScan([pagePath]);
		expect(recipe.detect(scan, sources)).toEqual([]);
	});

	test('links inside fenced code block are ignored', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		writeFileSync(
			pagePath,
			'# Page\n\n```markdown\n[foo](/foo)\n```\n',
		);
		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		expect(recipe.detect(scan, sources)).toEqual([]);
	});

	test('links inside inline code (`...`) are ignored', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\nUse `[foo](/foo)` like this.\n');
		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		expect(recipe.detect(scan, sources)).toEqual([]);
	});

	test('relative path resolves from current dir', () => {
		mkdirSync(join(docs, 'sub'));
		writeFileSync(join(docs, 'sub', 'sibling.md'), '# Sibling\n');
		const pagePath = join(docs, 'sub', 'page.md');
		writeFileSync(pagePath, '# Page\n\nSee [sib](./sibling).\n');
		const { scan, sources } = makeScan([pagePath, join(docs, 'sub', 'sibling.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(1);
		expect(findings[0].payload?.suggested).toBe('./sibling.md');
	});

	test('link with anchor: foo#sec → foo.md#sec', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		writeFileSync(pagePath, '# Page\n\n[anchor](/foo#section)\n');
		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(1);
		expect(findings[0].payload?.suggested).toBe('/foo.md#section');
	});
});

describe('normalize-link-suffix — apply', () => {
	test('replaces first occurrence with suggested suffix', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		const source = '# Page\n\nSee [foo](/foo).\n';
		writeFileSync(pagePath, source);
		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		const findings = recipe.detect(scan, sources);
		expect(findings.length).toBe(1);
		const after = recipe.apply!(findings[0], source);
		expect(after).toBe('# Page\n\nSee [foo](/foo.md).\n');
	});

	test('idempotent: re-applying on result is no-op', () => {
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');
		const pagePath = join(docs, 'page.md');
		const source = '# Page\n\nSee [foo](/foo).\n';
		writeFileSync(pagePath, source);
		const { scan, sources } = makeScan([pagePath, join(docs, 'foo.md')]);
		const findings = recipe.detect(scan, sources);
		const after1 = recipe.apply!(findings[0], source);
		const after2 = recipe.apply!(findings[0], after1);
		// Second apply finds no `](/foo)` (link already has .md) → no-op
		expect(after2).toBe(after1);
	});
});
