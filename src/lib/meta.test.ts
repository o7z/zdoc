import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirMeta, parseYaml } from './meta.js';

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

// v2-prep: parseYaml supports list-of-mappings (the YAML shape behind the
// new `children:` schema). See docs/dev/next-major.md.
describe('parseYaml — list-of-mappings (children: shape)', () => {
	test('basic list of mappings under a top-level key', () => {
		const parsed = parseYaml(
			`title: Authoring\nchildren:\n  - name: meta-yaml\n    title: _meta.yaml\n  - name: page-fields\n    title: Page fields\n`,
		);
		expect(parsed.title).toBe('Authoring');
		expect(Array.isArray(parsed.children)).toBe(true);
		const c = parsed.children as Array<Record<string, unknown>>;
		expect(c.length).toBe(2);
		expect(c[0].name).toBe('meta-yaml');
		expect(c[0].title).toBe('_meta.yaml');
		expect(c[1].name).toBe('page-fields');
		expect(c[1].title).toBe('Page fields');
	});

	test('list item with only a name field (subdir shorthand)', () => {
		const parsed = parseYaml(
			`children:\n  - name: choose-a-structure\n  - name: lifecycle\n    title: Lifecycle\n`,
		);
		const c = parsed.children as Array<Record<string, unknown>>;
		expect(c.length).toBe(2);
		expect(c[0].name).toBe('choose-a-structure');
		expect(c[0].title).toBeUndefined();
		expect(c[1].name).toBe('lifecycle');
		expect(c[1].title).toBe('Lifecycle');
	});

	test('list items carry PageMeta-shaped fields', () => {
		const parsed = parseYaml(
			`children:\n  - name: foo\n    title: Foo\n    order: 10\n    description: Hello\n    visibility: prod-only\n    lifecycle: stable\n`,
		);
		const c = parsed.children as Array<Record<string, unknown>>;
		expect(c[0].name).toBe('foo');
		expect(c[0].title).toBe('Foo');
		expect(c[0].order).toBe(10);
		expect(c[0].description).toBe('Hello');
		expect(c[0].visibility).toBe('prod-only');
		expect(c[0].lifecycle).toBe('stable');
	});

	test('pages and children can coexist in the same document', () => {
		const parsed = parseYaml(
			`title: Mixed\npages:\n  legacy:\n    title: Legacy\nchildren:\n  - name: modern\n    title: Modern\n`,
		);
		expect(parsed.title).toBe('Mixed');
		expect(parsed.pages).toBeDefined();
		expect((parsed.pages as Record<string, unknown>).legacy).toBeDefined();
		expect(Array.isArray(parsed.children)).toBe(true);
		const c = parsed.children as Array<Record<string, unknown>>;
		expect(c.length).toBe(1);
		expect(c[0].name).toBe('modern');
	});

	test('list-of-mappings does not break top-level pages parsing', () => {
		// Regression guard: the legacy pages map must still parse correctly
		// even after parseYaml gained list support.
		const parsed = parseYaml(
			`title: LegacyOnly\npages:\n  intro:\n    title: Intro\n    order: 1\n  guide:\n    title: Guide\n    order: 2\n`,
		);
		expect(parsed.children).toBeUndefined();
		const pages = parsed.pages as Record<string, Record<string, unknown>>;
		expect(pages.intro.title).toBe('Intro');
		expect(pages.guide.order).toBe(2);
	});

	test('three or more items, preserving order', () => {
		const parsed = parseYaml(
			`children:\n  - name: a\n  - name: b\n  - name: c\n  - name: d\n`,
		);
		const c = parsed.children as Array<Record<string, unknown>>;
		expect(c.map((x) => x.name)).toEqual(['a', 'b', 'c', 'd']);
	});

	test('empty children: key with no list items → null (not crash)', () => {
		// `children:` followed by nothing (or only sibling top-level keys) is
		// an edge case: parseYaml resolves the value to null, exactly as it
		// does for any empty mapping/sequence key.
		const parsed = parseYaml(`title: T\nchildren:\n`);
		expect(parsed.title).toBe('T');
		expect(parsed.children).toBeNull();
	});
});

// v2-prep: readDirMeta exposes ChildEntry[] under DirMeta.children when the
// file uses the new `children:` schema; visibility: field is recognized
// alongside legacy env: field. See docs/dev/next-major.md.
describe('readDirMeta — children list + visibility field', () => {
	test('children: list is exposed as DirMeta.children with PageMeta fields', () => {
		withMeta(
			`title: Authoring\nchildren:\n  - name: meta-yaml\n    title: _meta.yaml\n    order: 10\n  - name: page-fields\n    title: Page fields\n    description: Doc fields\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.title).toBe('Authoring');
				expect(m?.children?.length).toBe(2);
				expect(m?.children?.[0].name).toBe('meta-yaml');
				expect(m?.children?.[0].title).toBe('_meta.yaml');
				expect(m?.children?.[0].order).toBe(10);
				expect(m?.children?.[1].name).toBe('page-fields');
				expect(m?.children?.[1].description).toBe('Doc fields');
			},
		);
	});

	test('child entry with missing name field is skipped', () => {
		withMeta(
			`children:\n  - name: kept\n    title: Kept\n  - title: NoName\n  - name: also-kept\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.children?.length).toBe(2);
				expect(m?.children?.map((c) => c.name)).toEqual(['kept', 'also-kept']);
			},
		);
	});

	test('visibility: field on a page entry is recognized', () => {
		withMeta(
			`title: Group\npages:\n  marketing:\n    title: Marketing\n    visibility: prod-only\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.marketing.visibility).toBe('prod-only');
			},
		);
	});

	test('visibility: field on a child entry is recognized', () => {
		withMeta(
			`children:\n  - name: marketing\n    title: Marketing\n    visibility: prod-only\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.children?.[0].visibility).toBe('prod-only');
				expect(m?.children?.[0].name).toBe('marketing');
			},
		);
	});

	test('visibility: field at top level (dir-scoped) is recognized', () => {
		withMeta(`title: Internal\nvisibility: prod-only\n`, (p) => {
			const m = readDirMeta(p);
			expect(m?.visibility).toBe('prod-only');
			expect(m?.title).toBe('Internal');
		});
	});

	test('env and visibility coexist without overriding each other', () => {
		withMeta(
			`pages:\n  foo:\n    title: Foo\n    env: prod\n    visibility: prod-only\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.foo.env).toBe('prod');
				expect(m?.pages?.foo.visibility).toBe('prod-only');
			},
		);
	});

	test('pages and children coexist in the same DirMeta (lint reports it later)', () => {
		withMeta(
			`title: Mixed\npages:\n  legacy:\n    title: Legacy\nchildren:\n  - name: modern\n    title: Modern\n`,
			(p) => {
				const m = readDirMeta(p);
				expect(m?.pages?.legacy.title).toBe('Legacy');
				expect(m?.children?.length).toBe(1);
				expect(m?.children?.[0].name).toBe('modern');
			},
		);
	});
});
