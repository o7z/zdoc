import { test, expect, describe } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDocsAsset } from './docs-asset.js';

function withDocs(layout: Record<string, string>, run: (docsDir: string) => void) {
	const dir = mkdtempSync(join(tmpdir(), 'zdoc-asset-test-'));
	for (const [rel, content] of Object.entries(layout)) {
		const full = join(dir, rel);
		mkdirSync(join(full, '..'), { recursive: true });
		writeFileSync(full, content);
	}
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('resolveDocsAsset', () => {
	test('returns mime + path for an existing png', () => {
		withDocs({ 'img/a.png': 'fake' }, (dir) => {
			const r = resolveDocsAsset(dir, '/img/a.png');
			expect(r?.mime).toBe('image/png');
			expect(r?.filePath).toBe(join(dir, 'img', 'a.png'));
		});
	});

	test('matches relative-image path used by docs (./img/x.png from a nested page)', () => {
		// page at /a/b/page.md referencing ./img/x.png → browser requests /a/b/img/x.png
		withDocs({ 'a/b/img/x.png': 'fake' }, (dir) => {
			const r = resolveDocsAsset(dir, '/a/b/img/x.png');
			expect(r?.mime).toBe('image/png');
		});
	});

	test('uppercase extension is normalized', () => {
		withDocs({ 'a.PNG': 'fake' }, (dir) => {
			const r = resolveDocsAsset(dir, '/a.PNG');
			expect(r?.mime).toBe('image/png');
		});
	});

	test('jpeg / jpg / webp / svg / gif / avif / ico are recognized', () => {
		withDocs(
			{
				'a.jpg': 'x',
				'b.jpeg': 'x',
				'c.webp': 'x',
				'd.svg': 'x',
				'e.gif': 'x',
				'f.avif': 'x',
				'g.ico': 'x',
			},
			(dir) => {
				expect(resolveDocsAsset(dir, '/a.jpg')?.mime).toBe('image/jpeg');
				expect(resolveDocsAsset(dir, '/b.jpeg')?.mime).toBe('image/jpeg');
				expect(resolveDocsAsset(dir, '/c.webp')?.mime).toBe('image/webp');
				expect(resolveDocsAsset(dir, '/d.svg')?.mime).toBe('image/svg+xml');
				expect(resolveDocsAsset(dir, '/e.gif')?.mime).toBe('image/gif');
				expect(resolveDocsAsset(dir, '/f.avif')?.mime).toBe('image/avif');
				expect(resolveDocsAsset(dir, '/g.ico')?.mime).toBe('image/x-icon');
			},
		);
	});

	test('unknown extension → null', () => {
		withDocs({ 'a.exe': 'x' }, (dir) => {
			expect(resolveDocsAsset(dir, '/a.exe')).toBeNull();
		});
	});

	test('no extension → null', () => {
		withDocs({}, (dir) => {
			expect(resolveDocsAsset(dir, '/img')).toBeNull();
		});
	});

	test('non-existent file → null', () => {
		withDocs({}, (dir) => {
			expect(resolveDocsAsset(dir, '/nope.png')).toBeNull();
		});
	});

	test('directory with image-like name → null (not a file)', () => {
		withDocs({ 'd.png/keep.txt': 'x' }, (dir) => {
			expect(resolveDocsAsset(dir, '/d.png')).toBeNull();
		});
	});

	test('path traversal via /.. is blocked', () => {
		withDocs({ 'inner/a.png': 'x' }, (dir) => {
			// Sibling of docsDir holds a target file we should NOT be able to reach.
			expect(resolveDocsAsset(dir, '/../escape.png')).toBeNull();
		});
	});

	test('encoded traversal (%2e%2e) is blocked after decoding', () => {
		withDocs({ 'inner/a.png': 'x' }, (dir) => {
			expect(resolveDocsAsset(dir, '/%2e%2e/escape.png')).toBeNull();
		});
	});

	test('malformed percent-encoding → null (does not throw)', () => {
		withDocs({}, (dir) => {
			expect(resolveDocsAsset(dir, '/%E0%A4.png')).toBeNull();
		});
	});

	test('percent-encoded non-ASCII path is decoded and resolved', () => {
		withDocs({ '截图/一.png': 'x' }, (dir) => {
			const encoded = '/' + encodeURIComponent('截图') + '/' + encodeURIComponent('一') + '.png';
			const r = resolveDocsAsset(dir, encoded);
			expect(r?.mime).toBe('image/png');
		});
	});
});
