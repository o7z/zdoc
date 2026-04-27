import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirMeta } from './meta.js';

function withMeta(yaml: string, run: (path: string) => void) {
	const dir = mkdtempSync(join(tmpdir(), 'zdoc-meta-test-'));
	const path = join(dir, '_meta.yaml');
	writeFileSync(path, yaml);
	try {
		run(path);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('lifecycle field', () => {
	test('accepts "draft"', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    lifecycle: draft\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.lifecycle).toBe('draft');
			},
		);
	});

	test('accepts "stable"', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    lifecycle: stable\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.lifecycle).toBe('stable');
			},
		);
	});

	test('accepts "archived"', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    lifecycle: archived\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.lifecycle).toBe('archived');
			},
		);
	});

	test('rejects invalid value (not in whitelist) → undefined', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    lifecycle: frozen\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.lifecycle).toBeUndefined();
			},
		);
	});

	test('rejects non-string (number) → undefined', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    lifecycle: 123\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.lifecycle).toBeUndefined();
			},
		);
	});
});

describe('superseded_by field', () => {
	test('preserves string path', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    superseded_by: /docs/new.md\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.superseded_by).toBe('/docs/new.md');
			},
		);
	});

	test('preserves quoted string with anchor', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    superseded_by: "/docs/new.md#sec"\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.superseded_by).toBe('/docs/new.md#sec');
			},
		);
	});
});

describe('folded_to field', () => {
	test('preserves path with anchor', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    folded_to: /docs/auth.md#manifest\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.folded_to).toBe('/docs/auth.md#manifest');
			},
		);
	});

	test('rejects non-string → undefined', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    folded_to: 42\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.folded_to).toBeUndefined();
			},
		);
	});
});

describe('stripComment / # handling (regression)', () => {
	test('# preceded by space is still treated as comment', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo # this is a comment\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.title).toBe('Foo');
			},
		);
	});

	test('# at line start is still treated as comment', () => {
		withMeta(
			`title: Group\n# top-level comment\npages:\n  foo:\n    title: Foo\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.title).toBe('Foo');
			},
		);
	});

	test('# inside unquoted value is preserved (not stripped)', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    folded_to: /a.md#sec1\n    superseded_by: /b.md#sec2\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.folded_to).toBe('/a.md#sec1');
				expect(m?.pages?.foo.superseded_by).toBe('/b.md#sec2');
			},
		);
	});
});

describe('backward compatibility', () => {
	test('omitting all three new fields → all undefined, other fields intact', () => {
		withMeta(
			`title: Group\norder: 5\npages:\n  foo:\n    title: Foo\n    order: 1\n    author: alice\n    modified: 2026-04-27\n    description: Hello\n`,
			(p) => {
				const m = readDirMeta(p);
				const foo = m?.pages?.foo;
				expect(foo?.lifecycle).toBeUndefined();
				expect(foo?.superseded_by).toBeUndefined();
				expect(foo?.folded_to).toBeUndefined();
				expect(foo?.title).toBe('Foo');
				expect(foo?.order).toBe(1);
				expect(foo?.author).toBe('alice');
				expect(foo?.modified).toBe('2026-04-27');
				expect(foo?.description).toBe('Hello');
			},
		);
	});

	test('all three fields together coexist with legacy fields', () => {
		withMeta(
			`title: Group\npages:\n  foo:\n    title: Foo\n    author: bob\n    lifecycle: archived\n    superseded_by: /docs/new.md\n    folded_to: /docs/auth.md#sec\n`,
			(p) => {
				const m = readDirMeta(p);
				const foo = m?.pages?.foo;
				expect(foo?.lifecycle).toBe('archived');
				expect(foo?.superseded_by).toBe('/docs/new.md');
				expect(foo?.folded_to).toBe('/docs/auth.md#sec');
				expect(foo?.author).toBe('bob');
			},
		);
	});
});
