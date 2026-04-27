import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkDocs, searchDocs } from './mcp.ts';

let docs: string;
beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-mcp-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

function writeMeta(dir: string, body: string) {
	writeFileSync(join(dir, '_meta.yaml'), body);
}

function writeMd(path: string, body: string) {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body);
}

describe('walkDocs (MCP)', () => {
	test('returns empty array when dir does not exist', () => {
		expect(walkDocs(join(docs, 'nope'))).toEqual([]);
	});

	test('returns empty array when root has no _meta.yaml', () => {
		expect(walkDocs(docs)).toEqual([]);
	});

	test('flat list of pages with title + description', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  intro:\n    title: Intro\n    description: Welcome.\n`,
		);
		writeMd(join(docs, 'intro.md'), '# Intro\n\nWelcome.\n');
		const out = walkDocs(docs);
		expect(out.length).toBe(1);
		expect(out[0].title).toBe('Intro');
		expect(out[0].description).toBe('Welcome.');
		expect(out[0].path).toBe('intro.md');
		expect(out[0].link).toBe('/intro.md');
	});

	test('lifecycle / superseded_by / folded_to are propagated', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\n    lifecycle: archived\n    superseded_by: /current.md\n  current:\n    title: Current\n  research:\n    title: Research\n    folded_to: /current.md#sec\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		writeMd(join(docs, 'current.md'), '# Current\n');
		writeMd(join(docs, 'research.md'), '# Research\n');
		const out = walkDocs(docs);
		const legacy = out.find((p) => p.title === 'Legacy');
		const research = out.find((p) => p.title === 'Research');
		expect(legacy?.lifecycle).toBe('archived');
		expect(legacy?.superseded_by).toBe('/current.md');
		expect(research?.folded_to).toBe('/current.md#sec');
	});

	test('descends into subdirs and tracks breadcrumb titles', () => {
		writeMeta(docs, `title: Site\n`);
		mkdirSync(join(docs, 'guide'), { recursive: true });
		writeMeta(
			join(docs, 'guide'),
			`title: Guide\npages:\n  basics:\n    title: Basics\n`,
		);
		writeMd(join(docs, 'guide', 'basics.md'), '# Basics\n');
		const out = walkDocs(docs);
		expect(out.length).toBe(1);
		expect(out[0].parentDirTitles).toEqual(['Site', 'Guide']);
	});

	test('skips PDFs and pages without backing files', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  exists:\n    title: Exists\n  ghost:\n    title: Ghost\n  "report.pdf":\n    title: PDF Report\n`,
		);
		writeMd(join(docs, 'exists.md'), '# Exists\n');
		const out = walkDocs(docs);
		expect(out.length).toBe(1);
		expect(out[0].title).toBe('Exists');
	});
});

describe('searchDocs', () => {
	const seed = () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  install:\n    title: Install Guide\n    description: How to install zdoc.\n  api:\n    title: API Reference\n    description: REST API endpoints.\n  legacy:\n    title: Legacy Notes\n    lifecycle: archived\n`,
		);
		writeMd(join(docs, 'install.md'), '# Install\n\nRun npm install zdoc.\n');
		writeMd(join(docs, 'api.md'), '# API\n\nThe manifest endpoint accepts JSON.\n');
		writeMd(join(docs, 'legacy.md'), '# Legacy\n\nManifest format was deprecated.\n');
	};

	test('empty query returns []', () => {
		seed();
		expect(searchDocs(docs, '', 10)).toEqual([]);
	});

	test('matches by title (highest weight, ranks first)', () => {
		seed();
		const hits = searchDocs(docs, 'install', 10);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0].title).toContain('Install');
	});

	test('matches by content body', () => {
		seed();
		const hits = searchDocs(docs, 'manifest', 10);
		expect(hits.find((h) => h.title === 'API Reference')).toBeDefined();
	});

	test('excludes archived from search results', () => {
		seed();
		const hits = searchDocs(docs, 'manifest', 10);
		expect(hits.find((h) => h.title === 'Legacy Notes')).toBeUndefined();
		expect(hits.find((h) => h.title === 'Legacy')).toBeUndefined();
	});

	test('respects limit', () => {
		seed();
		const hits = searchDocs(docs, 'a', 1);
		expect(hits.length).toBeLessThanOrEqual(1);
	});

	test('case-insensitive', () => {
		seed();
		expect(searchDocs(docs, 'INSTALL', 10).length).toBeGreaterThan(0);
		expect(searchDocs(docs, 'Install', 10).length).toBeGreaterThan(0);
	});

	test('returns hit with section breadcrumb', () => {
		seed();
		const hits = searchDocs(docs, 'install', 10);
		expect(hits[0].section).toBe('Site');
	});
});
