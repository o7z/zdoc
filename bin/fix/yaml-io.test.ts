import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { dumpDirMeta, readDirMetaWithSha } from './yaml-io.ts';
import { readDirMeta } from '../meta-mini.ts';
import type { DirMeta, PageMeta } from './types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-parse a dumped string through readDirMeta. */
function parseFromDump(dumped: string): DirMeta | null {
	// meta-mini's readDirMeta reads from disk; use the internal parseYaml
	// via a temp-free approach: write to a temp file is not needed — instead
	// we parse inline using the exported parseYaml from meta-mini indirectly
	// by calling readDirMetaWithSha on a temp file. Since we can't easily call
	// parseYaml directly (not exported from yaml-io), we use writeFileSync +
	// readDirMeta. But to avoid fs coupling in unit tests we replicate the
	// mini-parser inline below.
	//
	// Simplest correct approach: use Bun.file temp write. But per rules, no new
	// deps. Use node:fs mkdtemp pattern.
	const { mkdtempSync, writeFileSync, rmSync } = require('node:fs') as typeof import('node:fs');
	const { tmpdir } = require('node:os') as typeof import('node:os');
	const dir = mkdtempSync(join(tmpdir(), 'zdoc-yaml-io-test-'));
	const path = join(dir, '_meta.yaml');
	try {
		writeFileSync(path, dumped, 'utf-8');
		return readDirMeta(path);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Roundtrip: all docs/**/_meta.yaml fixtures
// ---------------------------------------------------------------------------

const FIXTURE_PATHS = [
	join(import.meta.dir, '../../docs/_meta.yaml'),
	join(import.meta.dir, '../../docs/guide/_meta.yaml'),
	join(import.meta.dir, '../../docs/dev/_meta.yaml'),
];

describe('dumpDirMeta — fixture roundtrip', () => {
	for (const fixturePath of FIXTURE_PATHS) {
		const label = fixturePath.replace(/.*docs/, 'docs').replace(/\\/g, '/');
		test(`roundtrip: ${label}`, () => {
			const result = readDirMetaWithSha(fixturePath);
			expect(result).not.toBeNull();
			const meta = result!.meta!;
			expect(meta).not.toBeNull();

			const dumped = dumpDirMeta(meta);
			const reparsed = parseFromDump(dumped);
			expect(reparsed).not.toBeNull();

			// Deep-equal the reparsed object to the original (both coerced by readDirMeta)
			expect(reparsed).toEqual(meta);
		});
	}
});

// ---------------------------------------------------------------------------
// Idempotency: two consecutive dumps produce identical output
// ---------------------------------------------------------------------------

describe('dumpDirMeta — idempotency', () => {
	for (const fixturePath of FIXTURE_PATHS) {
		const label = fixturePath.replace(/.*docs/, 'docs').replace(/\\/g, '/');
		test(`idempotent: ${label}`, () => {
			const result = readDirMetaWithSha(fixturePath);
			const meta = result!.meta!;
			const first = dumpDirMeta(meta);
			const reparsed = parseFromDump(first)!;
			const second = dumpDirMeta(reparsed);
			expect(second).toBe(first);
		});
	}

	test('idempotent: rich synthetic meta', () => {
		const meta: DirMeta = {
			title: 'Test Dir',
			order: 5,
			env: 'dev',
			pages: {
				alpha: { title: 'Alpha', order: 1, lifecycle: 'stable' },
				beta: { title: 'Beta: subtitle', order: 2, lifecycle: 'draft', description: 'A description' },
			},
		};
		const first = dumpDirMeta(meta);
		const reparsed = parseFromDump(first)!;
		const second = dumpDirMeta(reparsed);
		expect(second).toBe(first);
	});
});

// ---------------------------------------------------------------------------
// LF endings, 2-space indent, ends with single '\n'
// ---------------------------------------------------------------------------

describe('dumpDirMeta — format rules', () => {
	test('output uses LF (no CRLF)', () => {
		const meta: DirMeta = { title: 'Site', pages: { a: { title: 'A' } } };
		const out = dumpDirMeta(meta);
		expect(out).not.toContain('\r');
	});

	test('ends with exactly one newline', () => {
		const meta: DirMeta = { title: 'Site' };
		const out = dumpDirMeta(meta);
		expect(out.endsWith('\n')).toBe(true);
		expect(out.endsWith('\n\n')).toBe(false);
	});

	test('page fields indented with 4 spaces (2 for pages block + 2 for key)', () => {
		const meta: DirMeta = { pages: { intro: { title: 'Intro', order: 1 } } };
		const out = dumpDirMeta(meta);
		expect(out).toContain('    title: Intro\n');
		expect(out).toContain('    order: 1\n');
	});

	test('no tabs anywhere in output', () => {
		const meta: DirMeta = { title: 'T', pages: { p: { title: 'P' } } };
		const out = dumpDirMeta(meta);
		expect(out).not.toContain('\t');
	});
});

// ---------------------------------------------------------------------------
// Field order: top-level
// ---------------------------------------------------------------------------

describe('dumpDirMeta — field order', () => {
	test('top-level fields appear in fixed order regardless of input order', () => {
		// Construct meta with fields set via Object.assign to avoid TS ordering assumptions
		const meta: DirMeta = {};
		// Assign in WRONG order intentionally
		(meta as Record<string, unknown>)['env'] = 'prod';
		(meta as Record<string, unknown>)['order'] = 3;
		(meta as Record<string, unknown>)['title'] = 'My Site';
		const out = dumpDirMeta(meta);
		const titlePos = out.indexOf('title:');
		const orderPos = out.indexOf('order:');
		const envPos = out.indexOf('env:');
		expect(titlePos).toBeLessThan(orderPos);
		expect(orderPos).toBeLessThan(envPos);
	});

	test('page-level fields appear in fixed order', () => {
		const page: PageMeta = {};
		// Assign in WRONG order
		(page as Record<string, unknown>)['lifecycle'] = 'archived';
		(page as Record<string, unknown>)['order'] = 2;
		(page as Record<string, unknown>)['title'] = 'Old Page';
		const meta: DirMeta = { pages: { old: page } };
		const out = dumpDirMeta(meta);
		// Extract the page block
		const pagesIdx = out.indexOf('pages:');
		const pageBlock = out.slice(pagesIdx);
		const titlePos = pageBlock.indexOf('title:');
		const orderPos = pageBlock.indexOf('order:');
		const lifecyclePos = pageBlock.indexOf('lifecycle:');
		expect(titlePos).toBeLessThan(orderPos);
		expect(orderPos).toBeLessThan(lifecyclePos);
	});
});

// ---------------------------------------------------------------------------
// Empty pages omitted
// ---------------------------------------------------------------------------

describe('dumpDirMeta — empty pages', () => {
	test('empty pages map: pages key omitted entirely', () => {
		const meta: DirMeta = { title: 'Site', pages: {} };
		const out = dumpDirMeta(meta);
		expect(out).not.toContain('pages:');
	});

	test('undefined pages: pages key omitted', () => {
		const meta: DirMeta = { title: 'Site' };
		const out = dumpDirMeta(meta);
		expect(out).not.toContain('pages:');
	});
});

// ---------------------------------------------------------------------------
// String quoting rules
// ---------------------------------------------------------------------------

describe('dumpDirMeta — string quoting', () => {
	function dumpTitle(title: string): string {
		return dumpDirMeta({ title });
	}

	test('plain string: no quotes', () => {
		expect(dumpTitle('Hello')).toContain('title: Hello\n');
	});

	test('string with ": " (colon-space): quoted', () => {
		expect(dumpTitle('key: value')).toContain('title: "key: value"\n');
	});

	test('string starting with #: quoted', () => {
		expect(dumpTitle('#comment')).toContain('title: "#comment"\n');
	});

	test('string with leading space: quoted', () => {
		expect(dumpTitle(' leading')).toContain('title: " leading"\n');
	});

	test('string with trailing space: quoted', () => {
		expect(dumpTitle('trailing ')).toContain('title: "trailing "\n');
	});

	test('string starting with -: quoted', () => {
		expect(dumpTitle('-item')).toContain('title: "-item"\n');
	});

	test('string starting with [: quoted', () => {
		expect(dumpTitle('[array]')).toContain('title: "[array]"\n');
	});

	test('string starting with {: quoted', () => {
		expect(dumpTitle('{map}')).toContain('title: "{map}"\n');
	});

	test('literal "true": quoted', () => {
		expect(dumpTitle('true')).toContain('title: "true"\n');
	});

	test('literal "false": quoted', () => {
		expect(dumpTitle('false')).toContain('title: "false"\n');
	});

	test('literal "null": quoted', () => {
		expect(dumpTitle('null')).toContain('title: "null"\n');
	});

	test('literal "~": quoted', () => {
		expect(dumpTitle('~')).toContain('title: "~"\n');
	});

	test('numeric-looking string "42": quoted', () => {
		expect(dumpTitle('42')).toContain('title: "42"\n');
	});

	test('float-looking string "3.14": quoted', () => {
		expect(dumpTitle('3.14')).toContain('title: "3.14"\n');
	});

	test('CJK string: no quotes needed', () => {
		expect(dumpTitle('首页')).toContain('title: 首页\n');
	});

	test('string with em-dash (—): no quotes needed', () => {
		// The fixture docs/_meta.yaml has "zdoc 专有术语与约定 —— ..." in description
		// em-dash is not a YAML special char
		const desc = 'zdoc 专有术语与约定 —— 链接预览';
		const out = dumpDirMeta({ pages: { glossary: { description: desc } } });
		expect(out).toContain(`description: ${desc}\n`);
	});

	test('double-quote inside value: escaped', () => {
		expect(dumpTitle('say "hello"')).toContain('title: "say \\"hello\\""\n');
	});

	test('backslash inside value: escaped', () => {
		expect(dumpTitle('path\\to')).toContain('title: "path\\\\to"\n');
	});

	test('string ending with colon: quoted', () => {
		expect(dumpTitle('end:')).toContain('title: "end:"\n');
	});
});

// ---------------------------------------------------------------------------
// All field types appear (number, string, lifecycle enum)
// ---------------------------------------------------------------------------

describe('dumpDirMeta — all field types', () => {
	test('order is emitted as bare number', () => {
		const meta: DirMeta = { order: 42 };
		expect(dumpDirMeta(meta)).toContain('order: 42\n');
	});

	test('lifecycle enum value emitted unquoted', () => {
		const meta: DirMeta = {
			pages: { p: { lifecycle: 'archived' } },
		};
		expect(dumpDirMeta(meta)).toContain('lifecycle: archived\n');
	});

	test('superseded_by and folded_to emitted on page', () => {
		const meta: DirMeta = {
			pages: {
				legacy: { superseded_by: '/new.md', folded_to: '/archive.md#sec' },
			},
		};
		const out = dumpDirMeta(meta);
		expect(out).toContain('superseded_by: /new.md\n');
		expect(out).toContain('folded_to: /archive.md#sec\n');
	});

	test('missing fields not emitted (not null/empty)', () => {
		const meta: DirMeta = { title: 'T' };
		const out = dumpDirMeta(meta);
		expect(out).not.toContain('order:');
		expect(out).not.toContain('env:');
		expect(out).not.toContain('pages:');
	});
});

// ---------------------------------------------------------------------------
// Insertion order of pages preserved
// ---------------------------------------------------------------------------

describe('dumpDirMeta — pages insertion order', () => {
	test('pages emitted in input insertion order', () => {
		const meta: DirMeta = {
			pages: {
				zebra: { title: 'Z' },
				alpha: { title: 'A' },
				middle: { title: 'M' },
			},
		};
		const out = dumpDirMeta(meta);
		const zPos = out.indexOf('zebra:');
		const aPos = out.indexOf('alpha:');
		const mPos = out.indexOf('middle:');
		expect(zPos).toBeLessThan(aPos);
		expect(aPos).toBeLessThan(mPos);
	});
});

// ---------------------------------------------------------------------------
// Sample output sanity check (docs/guide/_meta.yaml)
// ---------------------------------------------------------------------------

describe('dumpDirMeta — sample output', () => {
	test('docs/guide/_meta.yaml dumps to expected minimal form', () => {
		const guidePath = join(import.meta.dir, '../../docs/guide/_meta.yaml');
		const result = readDirMetaWithSha(guidePath);
		const out = dumpDirMeta(result!.meta!);
		// guide/_meta.yaml has title and order only, no pages
		expect(out).toBe('title: 指南\norder: 10\n');
	});
});
