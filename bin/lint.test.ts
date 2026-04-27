import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintDocs } from './lint.ts';

let docs: string;
beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-lint-test-'));
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

describe('lintDocs — happy path', () => {
	test('healthy docs: 0 errors, 0 warnings', () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n\nWelcome.\n');
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
		expect(r.warnings).toBe(0);
	});
});

describe('lintDocs — _meta.yaml consistency', () => {
	test('pages key with no matching file → error', () => {
		writeMeta(docs, `title: Site\npages:\n  ghost:\n    title: Ghost\n`);
		const r = lintDocs(docs);
		expect(r.errors).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.message.includes('ghost.md 不存在'))).toBe(true);
	});

	test('orphan .md (file exists but not listed) → warning', () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');
		const r = lintDocs(docs);
		expect(r.warnings).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.file.includes('orphan.md') && m.severity === 'warning')).toBe(true);
	});

	test('index.md and README.md are not flagged as orphans', () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'index.md'), '# Home\n');
		writeMd(join(docs, 'README.md'), '# Readme\n');
		const r = lintDocs(docs);
		expect(r.warnings).toBe(0);
	});
});

describe('lintDocs — lifecycle target existence', () => {
	test('superseded_by target does not exist → warning', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\n    superseded_by: /missing.md\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('superseded_by'))).toBe(true);
	});

	test('superseded_by target exists → no warning', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\n    superseded_by: /current.md\n  current:\n    title: Current\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		writeMd(join(docs, 'current.md'), '# Current\n');
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('superseded_by'))).toBe(false);
	});

	test('folded_to with anchor: only the file part is checked', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  research:\n    title: Research\n    folded_to: /schema.md#manifest\n  schema:\n    title: Schema\n`,
		);
		writeMd(join(docs, 'research.md'), '# Research\n');
		writeMd(join(docs, 'schema.md'), '# Schema\n');
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('folded_to'))).toBe(false);
	});

	test('folded_to file missing → warning', () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  research:\n    title: Research\n    folded_to: /missing.md#sec\n`,
		);
		writeMd(join(docs, 'research.md'), '# Research\n');
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('folded_to'))).toBe(true);
	});
});

describe('lintDocs — internal links', () => {
	test('broken internal link → error', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'page.md'), '# Page\n\nSee [other](/missing.md).\n');
		const r = lintDocs(docs);
		expect(r.errors).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.message.includes('内部链接断裂'))).toBe(true);
	});

	test('valid internal link → no error', () => {
		writeMeta(docs, `title: Site\npages:\n  a:\n    title: A\n  b:\n    title: B\n`);
		writeMd(join(docs, 'a.md'), '# A\n\nSee [B](/b.md).\n');
		writeMd(join(docs, 'b.md'), '# B\n');
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('内部链接断裂'))).toBe(false);
	});

	test('external links (http/mailto) are ignored', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'page.md'), '# Page\n\n[ext](https://example.com) [m](mailto:a@b.com)\n');
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('same-page anchor (#sec) is ignored', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'page.md'), '# Page\n\n[anchor](#section)\n');
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('relative link resolved from current dir', () => {
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMeta(join(docs, 'sub'), `title: Sub\npages:\n  inner:\n    title: Inner\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'sub', 'inner.md'), '# Inner\n\nSee [intro](../intro.md).\n');
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('内部链接断裂'))).toBe(false);
	});
});

describe('lintDocs — code block / inline code skip', () => {
	test('links inside fenced code block are not validated', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```markdown\n[example](/never-exists.md)\n```\n',
		);
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('links inside ~~~ fenced block are not validated', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n~~~\n[example](/never-exists.md)\n~~~\n',
		);
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('links inside inline code (`...`) are not validated', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\nUse the form `[name](/never-exists.md)` for links.\n',
		);
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('real link outside code is still validated', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\nReal: [broken](/missing.md)\n\n```\nFake: [also-broken](/also-missing.md)\n```\n',
		);
		const r = lintDocs(docs);
		expect(r.errors).toBe(1);
		expect(r.messages[0].message).toContain('/missing.md');
	});

	test('folded blockquote inside fenced block is skipped', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```markdown\n> 已折叠到 [target](/never-exists.md)\n```\n',
		);
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
	});
});

describe('lintDocs — folded blockquote convention', () => {
	test('"> 已折叠到 [text](missing)" → error', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n## Section\n\n> 已折叠到 [target](/missing.md)\n> see source.\n',
		);
		const r = lintDocs(docs);
		expect(r.errors).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.message.includes('折叠 blockquote'))).toBe(true);
	});

	test('"> 已折叠到 [text](existing)" → no error', () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n  target:\n    title: Target\n`);
		writeMd(join(docs, 'target.md'), '# Target\n');
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n## Section\n\n> 已折叠到 [target](/target.md)\n',
		);
		const r = lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('折叠 blockquote'))).toBe(false);
	});
});

describe('lintDocs — exit code semantics (via report)', () => {
	test('only warnings → errors == 0', () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');
		const r = lintDocs(docs);
		expect(r.errors).toBe(0);
		expect(r.warnings).toBeGreaterThan(0);
	});
});
