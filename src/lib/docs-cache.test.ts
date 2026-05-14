import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createDocsCache,
	createAsyncDocsCache,
	computeDocsSignature,
} from './docs-cache.js';

let dirA: string;
let dirB: string;

beforeEach(() => {
	dirA = mkdtempSync(join(tmpdir(), 'zdoc-cache-a-'));
	dirB = mkdtempSync(join(tmpdir(), 'zdoc-cache-b-'));
	writeFileSync(join(dirA, '_meta.yaml'), 'title: A\npages:\n  index: {title: Home}\n');
	writeFileSync(join(dirA, 'index.md'), '# Home\n');
	writeFileSync(join(dirB, '_meta.yaml'), 'title: B\npages:\n  index: {title: Home B}\n');
	writeFileSync(join(dirB, 'index.md'), '# Home B\n');
});

afterEach(() => {
	rmSync(dirA, { recursive: true, force: true });
	rmSync(dirB, { recursive: true, force: true });
});

function bumpMtime(path: string): void {
	const now = new Date();
	const future = new Date(now.getTime() + 2000);
	utimesSync(path, future, future);
}

describe('computeDocsSignature', () => {
	test('returns empty string for missing directory', () => {
		expect(computeDocsSignature(join(tmpdir(), 'zdoc-cache-does-not-exist-xyz'))).toBe('');
	});

	test('includes .md, .yaml, .yml files but ignores unrelated extensions', () => {
		writeFileSync(join(dirA, 'note.txt'), 'ignored');
		writeFileSync(join(dirA, 'toc.yml'), 'href: index.md');
		const sig = computeDocsSignature(dirA);
		expect(sig).toContain('index.md');
		expect(sig).toContain('_meta.yaml');
		expect(sig).toContain('toc.yml');
		expect(sig).not.toContain('note.txt');
	});

	test('changes when an existing file mtime changes', () => {
		const before = computeDocsSignature(dirA);
		bumpMtime(join(dirA, 'index.md'));
		const after = computeDocsSignature(dirA);
		expect(after).not.toBe(before);
	});

	test('changes when a file is added', () => {
		const before = computeDocsSignature(dirA);
		writeFileSync(join(dirA, 'extra.md'), '# Extra\n');
		const after = computeDocsSignature(dirA);
		expect(after).not.toBe(before);
	});

	test('two different directories produce different signatures', () => {
		expect(computeDocsSignature(dirA)).not.toBe(computeDocsSignature(dirB));
	});
});

describe('createDocsCache (sync)', () => {
	test('cache hit avoids re-invoking the builder', () => {
		const cache = createDocsCache<number>('test');
		let calls = 0;
		const build = () => {
			calls += 1;
			return calls;
		};
		expect(cache.get(dirA, build)).toBe(1);
		expect(cache.get(dirA, build)).toBe(1);
		expect(cache.get(dirA, build)).toBe(1);
		expect(calls).toBe(1);
	});

	test('cache invalidates when a file changes', () => {
		const cache = createDocsCache<number>('test');
		let calls = 0;
		const build = () => ++calls;

		expect(cache.get(dirA, build)).toBe(1);
		expect(cache.get(dirA, build)).toBe(1);

		bumpMtime(join(dirA, 'index.md'));

		expect(cache.get(dirA, build)).toBe(2);
		expect(cache.get(dirA, build)).toBe(2);
		expect(calls).toBe(2);
	});

	test('different docsDirs are isolated', () => {
		const cache = createDocsCache<string>('test');
		const buildA = () => 'A';
		const buildB = () => 'B';

		expect(cache.get(dirA, buildA)).toBe('A');
		expect(cache.get(dirB, buildB)).toBe('B');

		bumpMtime(join(dirA, 'index.md'));

		let calls = 0;
		const buildBAgain = () => {
			calls += 1;
			return 'B-rebuilt';
		};
		expect(cache.get(dirB, buildBAgain)).toBe('B');
		expect(calls).toBe(0);
	});

	test('clear() removes all entries', () => {
		const cache = createDocsCache<number>('test');
		let calls = 0;
		const build = () => ++calls;

		cache.get(dirA, build);
		cache.clear();
		cache.get(dirA, build);
		expect(calls).toBe(2);
	});
});

describe('createAsyncDocsCache', () => {
	test('cache hit avoids re-invoking the async builder', async () => {
		const cache = createAsyncDocsCache<number>('test');
		let calls = 0;
		const build = async () => ++calls;

		expect(await cache.get(dirA, build)).toBe(1);
		expect(await cache.get(dirA, build)).toBe(1);
		expect(calls).toBe(1);
	});

	test('cache invalidates when a file changes', async () => {
		const cache = createAsyncDocsCache<number>('test');
		let calls = 0;
		const build = async () => ++calls;

		expect(await cache.get(dirA, build)).toBe(1);
		bumpMtime(join(dirA, 'index.md'));
		expect(await cache.get(dirA, build)).toBe(2);
	});

	test('concurrent calls for the same docsDir share the same in-flight promise', async () => {
		const cache = createAsyncDocsCache<number>('test');
		let calls = 0;
		const build = async () => {
			calls += 1;
			await new Promise((r) => setTimeout(r, 20));
			return calls;
		};

		const [a, b, c] = await Promise.all([
			cache.get(dirA, build),
			cache.get(dirA, build),
			cache.get(dirA, build),
		]);
		expect(a).toBe(1);
		expect(b).toBe(1);
		expect(c).toBe(1);
		expect(calls).toBe(1);
	});

	test('concurrent calls for different docsDirs do not share', async () => {
		const cache = createAsyncDocsCache<string>('test');
		let calls = 0;
		const buildA = async () => {
			calls += 1;
			await new Promise((r) => setTimeout(r, 10));
			return 'A';
		};
		const buildB = async () => {
			calls += 1;
			await new Promise((r) => setTimeout(r, 10));
			return 'B';
		};

		const [a, b] = await Promise.all([cache.get(dirA, buildA), cache.get(dirB, buildB)]);
		expect(a).toBe('A');
		expect(b).toBe('B');
		expect(calls).toBe(2);
	});

	test('different docsDirs are isolated under invalidation', async () => {
		const cache = createAsyncDocsCache<string>('test');
		await cache.get(dirA, async () => 'A1');
		await cache.get(dirB, async () => 'B1');

		bumpMtime(join(dirA, 'index.md'));

		let callsB = 0;
		const bRebuild = async () => {
			callsB += 1;
			return 'B-rebuilt';
		};
		expect(await cache.get(dirB, bRebuild)).toBe('B1');
		expect(callsB).toBe(0);
	});

	test('clear() removes all entries', async () => {
		const cache = createAsyncDocsCache<number>('test');
		let calls = 0;
		const build = async () => ++calls;

		await cache.get(dirA, build);
		cache.clear();
		await cache.get(dirA, build);
		expect(calls).toBe(2);
	});

	test('builder throw rejects all concurrent callers and does not poison the store', async () => {
		const cache = createAsyncDocsCache<number>('test');
		let buildAttempts = 0;
		const failing = async () => {
			buildAttempts += 1;
			await new Promise((r) => setTimeout(r, 10));
			throw new Error('build failed');
		};

		// Three concurrent callers share one in-flight rejection.
		const settled = await Promise.allSettled([
			cache.get(dirA, failing),
			cache.get(dirA, failing),
			cache.get(dirA, failing),
		]);
		for (const s of settled) expect(s.status).toBe('rejected');
		expect(buildAttempts).toBe(1);

		// Store was not poisoned: a subsequent healthy build runs and caches normally.
		let healthyCalls = 0;
		const healthy = async () => ++healthyCalls;
		expect(await cache.get(dirA, healthy)).toBe(1);
		expect(await cache.get(dirA, healthy)).toBe(1);
		expect(healthyCalls).toBe(1);
	});

	test('cached value is deep-frozen so accidental mutation throws', async () => {
		const cache = createAsyncDocsCache<{ items: number[] }>('test');
		const built = await cache.get(dirA, async () => ({ items: [1, 2, 3] }));
		expect(() => built.items.push(4)).toThrow();
		expect(() => {
			(built as { items: number[] }).items = [];
		}).toThrow();
	});

	// Guard: signature also captures stat.size, so same mtime + different content still invalidates.
	test('cache invalidates when a file size changes even at identical mtime', async () => {
		const cache = createAsyncDocsCache<number>('test');
		let calls = 0;
		const build = async () => ++calls;

		const indexPath = join(dirA, 'index.md');
		expect(await cache.get(dirA, build)).toBe(1);

		const st = statSync(indexPath);
		writeFileSync(indexPath, '# Home\n\nNew content longer than before.\n');
		utimesSync(indexPath, st.atime, st.mtime);

		expect(await cache.get(dirA, build)).toBe(2);
	});
});
