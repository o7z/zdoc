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
	test('healthy docs: 0 errors, no consistency warnings', async () => {
		// Use the new children: schema so meta-legacy-schema doesn't fire.
		writeMeta(docs, `title: Site\nchildren:\n  - name: intro\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n\nWelcome.\n');
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
		// 0 warnings on a v2-shape doc with no other issues
		expect(r.warnings).toBe(0);
	});
});

describe('lintDocs — _meta.yaml consistency', () => {
	test('pages key with no matching file → error', async () => {
		writeMeta(docs, `title: Site\npages:\n  ghost:\n    title: Ghost\n`);
		const r = await lintDocs(docs);
		expect(r.errors).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.message.includes('ghost.md 不存在'))).toBe(true);
	});

	test('orphan .md (file exists but not listed) → warning', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');
		const r = await lintDocs(docs);
		expect(r.warnings).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.file.includes('orphan.md') && m.severity === 'warning')).toBe(true);
	});

	test('index.md and README.md are not flagged as orphans', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'index.md'), '# Home\n');
		writeMd(join(docs, 'README.md'), '# Readme\n');
		const r = await lintDocs(docs);
		// Filter out v2-prep warnings (meta-legacy-schema etc.) so we
		// assert specifically on the orphan rule.
		const orphanWarnings = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('孤儿'),
		);
		expect(orphanWarnings.length).toBe(0);
	});
});

describe('lintDocs — lifecycle target existence', () => {
	test('superseded_by target does not exist → error', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\n    superseded_by: /missing.md\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('superseded_by'))).toBe(true);
	});

	test('superseded_by target exists → no error', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\n    superseded_by: /current.md\n  current:\n    title: Current\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		writeMd(join(docs, 'current.md'), '# Current\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('superseded_by'))).toBe(false);
	});

	test('folded_to with anchor: only the file part is checked', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  research:\n    title: Research\n    folded_to: /schema.md#manifest\n  schema:\n    title: Schema\n`,
		);
		writeMd(join(docs, 'research.md'), '# Research\n');
		writeMd(join(docs, 'schema.md'), '# Schema\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('folded_to'))).toBe(false);
	});

	test('folded_to file missing → error', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  research:\n    title: Research\n    folded_to: /missing.md#sec\n`,
		);
		writeMd(join(docs, 'research.md'), '# Research\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('folded_to'))).toBe(true);
	});
});

describe('lintDocs — internal links', () => {
	test('broken internal link → error', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'page.md'), '# Page\n\nSee [other](/missing.md).\n');
		const r = await lintDocs(docs);
		expect(r.errors).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.message.includes('内部链接断裂'))).toBe(true);
	});

	test('valid internal link → no error', async () => {
		writeMeta(docs, `title: Site\npages:\n  a:\n    title: A\n  b:\n    title: B\n`);
		writeMd(join(docs, 'a.md'), '# A\n\nSee [B](/b.md).\n');
		writeMd(join(docs, 'b.md'), '# B\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('内部链接断裂'))).toBe(false);
	});

	test('external links (http/mailto) are ignored', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'page.md'), '# Page\n\n[ext](https://example.com) [m](mailto:a@b.com)\n');
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('same-page anchor (#sec) is ignored', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'page.md'), '# Page\n\n[anchor](#section)\n');
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('relative link resolved from current dir', async () => {
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMeta(join(docs, 'sub'), `title: Sub\npages:\n  inner:\n    title: Inner\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'sub', 'inner.md'), '# Inner\n\nSee [intro](../intro.md).\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('内部链接断裂'))).toBe(false);
	});
});

describe('lintDocs — code block / inline code skip', () => {
	test('links inside fenced code block are not validated', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```markdown\n[example](/never-exists.md)\n```\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('links inside ~~~ fenced block are not validated', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n~~~\n[example](/never-exists.md)\n~~~\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('links inside inline code (`...`) are not validated', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\nUse the form `[name](/never-exists.md)` for links.\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('real link outside code is still validated', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\nReal: [broken](/missing.md)\n\n```\nFake: [also-broken](/also-missing.md)\n```\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(1);
		// errors[0], not messages[0], because v2-prep warnings may sit at the top.
		const errorMsg = r.messages.find((m) => m.severity === 'error');
		expect(errorMsg?.message).toContain('/missing.md');
	});

	test('folded blockquote inside fenced block is skipped', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```markdown\n> 已折叠到 [target](/never-exists.md)\n```\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});
});

describe('lintDocs — folded blockquote convention', () => {
	test('"> 已折叠到 [text](missing)" → error', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n## Section\n\n> 已折叠到 [target](/missing.md)\n> see source.\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBeGreaterThan(0);
		expect(r.messages.some((m) => m.message.includes('折叠 blockquote'))).toBe(true);
	});

	test('"> 已折叠到 [text](existing)" → no error', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n  target:\n    title: Target\n`);
		writeMd(join(docs, 'target.md'), '# Target\n');
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n## Section\n\n> 已折叠到 [target](/target.md)\n',
		);
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('折叠 blockquote'))).toBe(false);
	});
});

describe('lintDocs — mermaid syntax', () => {
	test('valid flowchart block → 0 errors', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```mermaid\nflowchart TD\n  A --> B\n```\n',
		);
		const r = await lintDocs(docs);
		expect(r.messages.filter((m) => m.message.includes('Mermaid')).length).toBe(0);
	});

	test('invalid flowchart → error with absolute line number on the bad body line', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		// File layout:
		//   line 1: # Page
		//   line 2: (blank)
		//   line 3: ```mermaid     ← fence open
		//   line 4: graph TD
		//   line 5:   A --!! B     ← bad body line (clamped target)
		//   line 6: ```
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```mermaid\ngraph TD\n  A --!! B\n```\n',
		);
		const r = await lintDocs(docs);
		const errs = r.messages.filter((m) => m.severity === 'error' && m.message.includes('语法错误'));
		expect(errs.length).toBe(1);
		expect(errs[0].line).toBe(5);
	});

	test('case-insensitive info string: Mermaid, MERMAID all validated', async () => {
		writeMeta(docs, `title: Site\npages:\n  a:\n    title: A\n  b:\n    title: B\n`);
		writeMd(
			join(docs, 'a.md'),
			'# A\n\n```Mermaid\ngraph TD\n  A --!! B\n```\n',
		);
		writeMd(
			join(docs, 'b.md'),
			'# B\n\n```MERMAID\ngraph TD\n  X --!! Y\n```\n',
		);
		const r = await lintDocs(docs);
		const errs = r.messages.filter((m) => m.message.includes('Mermaid 语法错误'));
		expect(errs.length).toBe(2);
	});

	test('non-mermaid fence (```js) is ignored', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```js\nthis is not mermaid;\n```\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
	});

	test('empty mermaid block → warning, not error', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```mermaid\n\n```\n',
		);
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
		expect(r.messages.some((m) => m.severity === 'warning' && m.message.includes('空 mermaid block'))).toBe(true);
	});

	test('mermaid fence inside ```` outer fence is NOT validated', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		// 4-backtick fence wraps a 3-backtick mermaid fence as plain text
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n````\n```mermaid\ngraph TD\n  A --!! B\n```\n````\n',
		);
		const r = await lintDocs(docs);
		expect(r.messages.filter((m) => m.message.includes('Mermaid 语法错误')).length).toBe(0);
	});

	// Smoke: each diagram type that the renderer supports must parse cleanly via
	// our lint pipeline. Jison-group (older parsers) and Langium-group (newer)
	// are exercised in the same call — mermaid routes internally.
	test('smoke: all major diagram types parse cleanly', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		const samples: Record<string, string> = {
			// Jison-parsed group
			flowchart: 'flowchart TD\n  A --> B',
			sequenceDiagram: 'sequenceDiagram\n  Alice->>Bob: hi',
			classDiagram: 'classDiagram\n  class Animal { +int age }',
			stateDiagram: 'stateDiagram-v2\n  [*] --> Idle',
			erDiagram: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
			gantt: 'gantt\n  title G\n  section S\n  Task :a1, 2024-01-01, 1d',
			pie: 'pie\n  "a" : 1\n  "b" : 2',
			mindmap: 'mindmap\n  root((root))\n    A\n    B',
			journey: 'journey\n  title J\n  section S\n  Task: 5: User',
			quadrantChart: 'quadrantChart\n  title Q\n  x-axis Low --> High\n  y-axis Low --> High\n  P1: [0.5, 0.5]',
			C4Context: 'C4Context\n  title C4\n  Person(u, "User")',
			// Langium-parsed group (via @mermaid-js/parser)
			gitGraph: 'gitGraph\n  commit\n  commit',
			'architecture-beta': 'architecture-beta\n  group api(cloud)[API]\n  service db(database)[Database] in api',
			'packet-beta': 'packet-beta\n  0-15: "Source Port"\n  16-31: "Destination Port"',
		};
		let body = '# Page\n';
		for (const [name, src] of Object.entries(samples)) {
			body += `\n## ${name}\n\n\`\`\`mermaid\n${src}\n\`\`\`\n`;
		}
		writeMd(join(docs, 'page.md'), body);
		const r = await lintDocs(docs);
		const mermaidErrs = r.messages.filter((m) => m.message.includes('Mermaid 语法错误'));
		if (mermaidErrs.length > 0) {
			console.error('Smoke failures:', mermaidErrs.map((m) => `${m.line}: ${m.message}`));
		}
		expect(mermaidErrs.length).toBe(0);
	});
});

describe('lintDocs — ejs syntax + type conflicts', () => {
	test('valid simple ejs block → no ejs messages', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<h1>Hello <%= name %></h1>\n```\n',
		);
		const r = await lintDocs(docs);
		const ejsMsgs = r.messages.filter((m) => m.message.toLowerCase().includes('ejs'));
		expect(ejsMsgs.length).toBe(0);
	});

	test('valid ejs with if + for → no ejs messages', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<% if (admin) { %>X<% } %>\n<% for (const i of items) { %><%= i.name %><% } %>\n```\n',
		);
		const r = await lintDocs(docs);
		const ejsMsgs = r.messages.filter((m) => m.message.toLowerCase().includes('ejs'));
		expect(ejsMsgs.length).toBe(0);
	});

	test('syntax error → 1 error', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<% if (admin %>oops\n```\n',
		);
		const r = await lintDocs(docs);
		const errs = r.messages.filter((m) => m.severity === 'error' && m.message.includes('EJS 语法错误'));
		expect(errs.length).toBe(1);
	});

	test('type conflict (string + object usage) → 1 warning', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<%= name %>\n<%= name.first %>\n```\n',
		);
		const r = await lintDocs(docs);
		const warns = r.messages.filter((m) => m.severity === 'warning' && m.message.includes('EJS 变量类型冲突'));
		expect(warns.length).toBe(1);
		expect(warns[0].message).toContain('name');
	});

	test('empty ejs block → warning, not error', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n\n```\n',
		);
		const r = await lintDocs(docs);
		const warns = r.messages.filter((m) => m.severity === 'warning' && m.message.includes('空 ejs block'));
		expect(warns.length).toBe(1);
	});

	test('function-call-containing template → silently skipped (no messages)', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<%= formatDate(d) %>\n<%= name %>\n<%= name.first %>\n```\n',
		);
		const r = await lintDocs(docs);
		// Has function call → entire block is silently skipped, so even the
		// name/name.first type conflict isn't reported.
		const ejsMsgs = r.messages.filter((m) => m.message.toLowerCase().includes('ejs'));
		expect(ejsMsgs.length).toBe(0);
	});

	test('method call counts as function call → silent skip', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<% items.forEach(x => x) %>\n```\n',
		);
		const r = await lintDocs(docs);
		const ejsMsgs = r.messages.filter((m) => m.message.toLowerCase().includes('ejs'));
		expect(ejsMsgs.length).toBe(0);
	});

	test('loop variable does not falsely conflict with outer locals of same name', async () => {
		writeMeta(docs, `title: Site\npages:\n  page:\n    title: Page\n`);
		writeMd(
			join(docs, 'page.md'),
			'# Page\n\n```ejs\n<% for (const item of items) { %><%= item %><% } %>\n<%= item.name %>\n```\n',
		);
		// Outer `item.name` is the locals var; inner `item` is the loop var.
		// In strict scope-tracking they belong to different bindings, so no
		// "primitive + object" conflict should fire for the outer item.
		const r = await lintDocs(docs);
		const warns = r.messages.filter((m) => m.severity === 'warning' && m.message.includes('EJS 变量类型冲突'));
		expect(warns.length).toBe(0);
	});
});

describe('lintDocs — exit code semantics (via report)', () => {
	test('only warnings → errors == 0', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'orphan.md'), '# Orphan\n');
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
		expect(r.warnings).toBeGreaterThan(0);
	});
});

describe('lintDocs — meta-subdir-as-file', () => {
	test('pages key is a directory (no .md) → warning emitted, no "不存在" error', async () => {
		// "sub" is a directory, not sub.md
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeMeta(join(docs, 'sub'), `title: Sub\n`);
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n  sub:\n    title: Sub\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		const warns = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('实际指向子目录'),
		);
		expect(warns.length).toBe(1);
		expect(warns[0].message).toContain('sub');
		// The existing "不存在" error must NOT fire for this key
		const notExistErrors = r.messages.filter(
			(m) => m.severity === 'error' && m.message.includes('sub.md 不存在'),
		);
		expect(notExistErrors.length).toBe(0);
	});

	test('pages key with matching .md file → no meta-subdir-as-file warning', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		const warns = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('实际指向子目录'),
		);
		expect(warns.length).toBe(0);
	});

	test('pages key with neither .md nor directory → existing error, not subdir warning', async () => {
		writeMeta(docs, `title: Site\npages:\n  ghost:\n    title: Ghost\n`);
		const r = await lintDocs(docs);
		// The original "不存在" error should still fire
		expect(r.messages.some((m) => m.severity === 'error' && m.message.includes('ghost.md 不存在'))).toBe(true);
		// No subdir warning
		expect(r.messages.some((m) => m.message.includes('实际指向子目录'))).toBe(false);
	});

	test('.pdf key is skipped by meta-subdir-as-file rule', async () => {
		// Create a directory named "report.pdf" — contrived but ensures the skip works
		mkdirSync(join(docs, 'report.pdf'), { recursive: true });
		writeMeta(docs, `title: Site\npages:\n  report.pdf:\n    title: Report\n`);
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('实际指向子目录'))).toBe(false);
	});
});

describe('lintDocs — meta-missing-title', () => {
	test('pages key without title → warning emitted', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    order: 1\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		const warns = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('缺少 title 字段'),
		);
		expect(warns.length).toBe(1);
		expect(warns[0].message).toContain('intro');
	});

	test('pages key with title → no missing-title warning', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Introduction\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('缺少 title 字段'))).toBe(false);
	});

	test('.pdf key skipped for missing-title rule', async () => {
		writeMeta(docs, `title: Site\npages:\n  report.pdf:\n`);
		writeFileSync(join(docs, 'report.pdf'), 'pdf content');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('缺少 title 字段'))).toBe(false);
	});

	test('multiple pages, only untitled ones warned', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  a:\n    title: A\n  b:\n    order: 2\n  c:\n    order: 3\n`,
		);
		writeMd(join(docs, 'a.md'), '# A\n');
		writeMd(join(docs, 'b.md'), '# B\n');
		writeMd(join(docs, 'c.md'), '# C\n');
		const r = await lintDocs(docs);
		const warns = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('缺少 title 字段'),
		);
		expect(warns.length).toBe(2);
		expect(warns.some((w) => w.message.includes('"b"'))).toBe(true);
		expect(warns.some((w) => w.message.includes('"c"'))).toBe(true);
	});
});

describe('lintDocs — meta-yaml-missing', () => {
	test('subdirectory with .md but no _meta.yaml → warning', async () => {
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeMeta(docs, `title: Site\n`);
		// sub/ has a .md but no _meta.yaml
		writeMd(join(docs, 'sub', 'page.md'), '# Page\n');
		const r = await lintDocs(docs);
		const warns = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('缺少 _meta.yaml'),
		);
		expect(warns.length).toBe(1);
		expect(warns[0].file).toContain('sub');
	});

	test('subdirectory with _meta.yaml → no missing-meta warning', async () => {
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMeta(join(docs, 'sub'), `title: Sub\npages:\n  page:\n    title: Page\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeMd(join(docs, 'sub', 'page.md'), '# Page\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('缺少 _meta.yaml'))).toBe(false);
	});

	test('docsDir root is skipped even without _meta.yaml', async () => {
		// No _meta.yaml at root, but has .md files — root is skipped
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('缺少 _meta.yaml'))).toBe(false);
	});

	test('subdirectory with only non-.md files → no warning', async () => {
		mkdirSync(join(docs, 'assets'), { recursive: true });
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		writeFileSync(join(docs, 'assets', 'image.png'), 'fake png');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('缺少 _meta.yaml'))).toBe(false);
	});
});

// v2-prep: meta-legacy-schema + meta-legacy-env-key warnings.
// See docs/dev/next-major.md "已决定".
describe('lintDocs — meta-legacy-schema (pages: → children:)', () => {
	test('pages-only doc → meta-legacy-schema warning', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('pages:') && m.message.includes('children:'))).toBe(true);
	});

	test('children-only doc → 0 legacy-schema warning', async () => {
		writeMeta(docs, `title: Site\nchildren:\n  - name: intro\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		expect(r.messages.some((m) => m.message.includes('v1 schema'))).toBe(false);
	});

	test('mixed pages+children → meta-legacy-schema warning fires once (only the pages: key triggers it)', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  legacy:\n    title: Legacy\nchildren:\n  - name: modern\n    title: Modern\n`,
		);
		writeMd(join(docs, 'legacy.md'), '# Legacy\n');
		writeMd(join(docs, 'modern.md'), '# Modern\n');
		const r = await lintDocs(docs);
		const legacySchemaHits = r.messages.filter((m) => m.message.includes('v1 schema'));
		expect(legacySchemaHits.length).toBe(1);
	});

	test('warning does not raise lint exit (errors still 0)', async () => {
		writeMeta(docs, `title: Site\npages:\n  intro:\n    title: Intro\n`);
		writeMd(join(docs, 'intro.md'), '# Intro\n');
		const r = await lintDocs(docs);
		expect(r.errors).toBe(0);
		expect(r.warnings).toBeGreaterThanOrEqual(1);
	});
});

describe('lintDocs — meta-legacy-env-key (env: → visibility:)', () => {
	test('pages entry with env: prod → meta-legacy-env-key warning', async () => {
		writeMeta(
			docs,
			`title: Site\npages:\n  marketing:\n    title: Marketing\n    env: prod\n`,
		);
		writeMd(join(docs, 'marketing.md'), '# Marketing\n');
		const r = await lintDocs(docs);
		const hits = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('env:') && m.message.includes('visibility:'),
		);
		expect(hits.length).toBe(1);
		expect(hits[0].message).toContain('pages.marketing');
	});

	test('children entry with env: prod → meta-legacy-env-key warning', async () => {
		writeMeta(
			docs,
			`title: Site\nchildren:\n  - name: marketing\n    title: Marketing\n    env: prod\n`,
		);
		writeMd(join(docs, 'marketing.md'), '# Marketing\n');
		const r = await lintDocs(docs);
		const hits = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('env:') && m.message.includes('visibility:'),
		);
		expect(hits.length).toBe(1);
		expect(hits[0].message).toContain('children.marketing');
	});

	test('top-level env: also triggers meta-legacy-env-key warning', async () => {
		writeMeta(docs, `title: Internal\nenv: prod\nchildren:\n  - name: foo\n    title: Foo\n`);
		writeMd(join(docs, 'foo.md'), '# Foo\n');
		const r = await lintDocs(docs);
		const hits = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('env:') && m.message.includes('visibility:'),
		);
		expect(hits.length).toBe(1);
	});

	test('visibility: prod-only on a child entry → 0 legacy-env-key warning', async () => {
		writeMeta(
			docs,
			`title: Site\nchildren:\n  - name: marketing\n    title: Marketing\n    visibility: prod-only\n`,
		);
		writeMd(join(docs, 'marketing.md'), '# Marketing\n');
		const r = await lintDocs(docs);
		const hits = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('env:') && m.message.includes('visibility:'),
		);
		expect(hits.length).toBe(0);
	});

	test('multiple env: occurrences each produce one warning', async () => {
		writeMeta(
			docs,
			`title: Site\nenv: prod\npages:\n  a:\n    title: A\n    env: prod\n  b:\n    title: B\n    env: prod\n`,
		);
		writeMd(join(docs, 'a.md'), '# A\n');
		writeMd(join(docs, 'b.md'), '# B\n');
		const r = await lintDocs(docs);
		const hits = r.messages.filter(
			(m) => m.severity === 'warning' && m.message.includes('env:') && m.message.includes('visibility:'),
		);
		expect(hits.length).toBe(3); // top-level + pages.a + pages.b
	});
});
