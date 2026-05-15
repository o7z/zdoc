import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	renderMarkdownCached,
	clearRenderCache,
	getRenderCacheSize,
} from './markdown.js';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'zdoc-md-cache-'));
	clearRenderCache();
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	clearRenderCache();
});

function bumpMtime(path: string): void {
	const future = new Date(Date.now() + 2000);
	utimesSync(path, future, future);
}

describe('renderMarkdownCached', () => {
	test('first call parses, second call hits cache', async () => {
		const file = join(dir, 'a.md');
		writeFileSync(file, '# Hello\n\nWorld.\n');

		const r1 = await renderMarkdownCached(file);
		expect(r1.html).toContain('<h1');
		expect(r1.html).toContain('Hello');
		expect(r1.headings).toHaveLength(1);
		expect(getRenderCacheSize()).toBe(1);

		const r2 = await renderMarkdownCached(file);
		// Same object identity proves cache hit (we returned the stored reference).
		expect(r2).toBe(r1);
	});

	test('mtime change invalidates cache', async () => {
		const file = join(dir, 'a.md');
		writeFileSync(file, '# Before\n');
		const r1 = await renderMarkdownCached(file);
		expect(r1.html).toContain('Before');

		writeFileSync(file, '# After\n');
		bumpMtime(file);

		const r2 = await renderMarkdownCached(file);
		expect(r2).not.toBe(r1);
		expect(r2.html).toContain('After');
	});

	test('size change at identical mtime still invalidates', async () => {
		const file = join(dir, 'a.md');
		writeFileSync(file, '# Short\n');
		const r1 = await renderMarkdownCached(file);
		const st1 = statSync(file);

		writeFileSync(file, '# Short heading with much more content following.\n');
		utimesSync(file, st1.atime, st1.mtime);

		const r2 = await renderMarkdownCached(file);
		expect(r2).not.toBe(r1);
	});

	test('different files are cached independently', async () => {
		const fa = join(dir, 'a.md');
		const fb = join(dir, 'b.md');
		writeFileSync(fa, '# A\n');
		writeFileSync(fb, '# B\n');

		const ra = await renderMarkdownCached(fa);
		const rb = await renderMarkdownCached(fb);
		expect(ra.html).toContain('A');
		expect(rb.html).toContain('B');
		expect(getRenderCacheSize()).toBe(2);

		// Re-fetch should hit cache for both.
		expect(await renderMarkdownCached(fa)).toBe(ra);
		expect(await renderMarkdownCached(fb)).toBe(rb);
	});

	test('concurrent calls for the same file share one parse', async () => {
		const file = join(dir, 'concurrent.md');
		writeFileSync(file, '# Concurrent\n');

		const [a, b, c] = await Promise.all([
			renderMarkdownCached(file),
			renderMarkdownCached(file),
			renderMarkdownCached(file),
		]);
		// All three resolved to the cached value with identity equality.
		expect(a).toBe(b);
		expect(b).toBe(c);
		expect(getRenderCacheSize()).toBe(1);
	});

	test('cached result is deep-frozen', async () => {
		const file = join(dir, 'frozen.md');
		writeFileSync(file, '# H1\n## H2\n');
		const r = await renderMarkdownCached(file);

		expect(() => {
			(r as { html: string }).html = 'mutated';
		}).toThrow();
		expect(() => r.headings.push({ depth: 1, text: 'x', slug: 'x' })).toThrow();
	});

	test('clearRenderCache resets state', async () => {
		const file = join(dir, 'a.md');
		writeFileSync(file, '# Hi\n');
		await renderMarkdownCached(file);
		expect(getRenderCacheSize()).toBe(1);

		clearRenderCache();
		expect(getRenderCacheSize()).toBe(0);

		await renderMarkdownCached(file);
		expect(getRenderCacheSize()).toBe(1);
	});
});
