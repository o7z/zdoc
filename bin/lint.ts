#!/usr/bin/env node
// zdoc lint — markdown docs linter.
// Checks _meta.yaml consistency, internal link health, lifecycle metadata
// targets, and the folded-blockquote convention.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { readDirMeta, parseYaml } from './meta-mini.js';

// -----------------------------------------------------------------------------
// Lint engine
// -----------------------------------------------------------------------------

export interface LintMessage {
	severity: 'error' | 'warning';
	file: string;
	line?: number;
	message: string;
}

interface DocsScan {
	docsDir: string;
	metaFiles: string[];        // absolute paths to all _meta.yaml files
	mdFiles: Set<string>;       // absolute paths to all .md files (for orphan check)
	listedFiles: Set<string>;   // absolute paths of files mentioned in any pages map
}

function walkDocs(docsDir: string): { dirs: string[]; mds: string[] } {
	const dirs: string[] = [];
	const mds: string[] = [];
	function visit(dir: string) {
		dirs.push(dir);
		const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
		for (const e of entries) {
			const p = join(dir, e.name);
			if (e.isDirectory()) visit(p);
			else if (e.isFile() && e.name.endsWith('.md')) mds.push(p);
		}
	}
	visit(docsDir);
	return { dirs, mds };
}

function scanDocs(docsDir: string): DocsScan {
	const { dirs, mds } = walkDocs(docsDir);
	const metaFiles: string[] = [];
	const listedFiles = new Set<string>();
	for (const d of dirs) {
		const meta = join(d, '_meta.yaml');
		if (existsSync(meta)) {
			metaFiles.push(meta);
			const dm = readDirMeta(meta);
			if (dm?.pages) {
				for (const key of Object.keys(dm.pages)) {
					const fileName = key.endsWith('.pdf') ? key : key + '.md';
					listedFiles.add(resolve(d, fileName));
				}
			}
			// v2-prep: children: entries also count toward "listed" so
			// children-only docs don't trip the orphan-md warning.
			if (dm?.children) {
				for (const child of dm.children) {
					const fileName = child.name.endsWith('.pdf') ? child.name : child.name + '.md';
					listedFiles.add(resolve(d, fileName));
				}
			}
		}
	}
	return { docsDir, metaFiles, mdFiles: new Set(mds), listedFiles };
}

function rel(docsDir: string, abs: string): string {
	return relative(docsDir, abs).split(sep).join('/') || '.';
}

// 1. _meta.yaml consistency: pages keys must point to existing files;
// .md files in the tree should be listed in their parent _meta.yaml.
function lintMetaConsistency(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];

	for (const meta of scan.metaFiles) {
		const dm = readDirMeta(meta);
		if (!dm) {
			out.push({ severity: 'error', file: rel(scan.docsDir, meta), message: '解析 _meta.yaml 失败' });
			continue;
		}
		if (!dm.pages) continue;
		const dir = dirname(meta);
		for (const key of Object.keys(dm.pages)) {
			const fileName = key.endsWith('.pdf') ? key : key + '.md';
			const target = resolve(dir, fileName);
			const subdirPath = resolve(dir, key);
			const subdirExists = existsSync(subdirPath) && statSync(subdirPath).isDirectory();
			if (!existsSync(target) || !statSync(target).isFile()) {
				// If a subdirectory with this name exists, suppress the "not found" error —
				// lintMetaSubdirAsFile will emit a warning for this case instead.
				if (!subdirExists) {
					out.push({
						severity: 'error',
						file: rel(scan.docsDir, meta),
						message: `pages 列出 "${key}" 但 ${fileName} 不存在`,
					});
				}
			}
		}
	}

	// Orphan .md files
	for (const md of scan.mdFiles) {
		if (md.endsWith(`${sep}index.md`)) continue;            // site home
		if (md.endsWith(`${sep}README.md`)) continue;            // common non-routed
		if (!scan.listedFiles.has(md)) {
			out.push({
				severity: 'warning',
				file: rel(scan.docsDir, md),
				message: '文件存在但未被任何 _meta.yaml 列出（孤儿）',
			});
		}
	}

	return out;
}

// US-004 Rule A: meta-subdir-as-file (warning)
// A pages: key whose name on disk is a directory (not a <name>.md).
// Emitting this warning is coordinated with lintMetaConsistency, which
// suppresses the "not found" error when the subdir exists.
function lintMetaSubdirAsFile(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	for (const meta of scan.metaFiles) {
		const dm = readDirMeta(meta);
		if (!dm?.pages) continue;
		const dir = dirname(meta);
		for (const key of Object.keys(dm.pages)) {
			if (key.endsWith('.pdf')) continue;
			const mdPath = resolve(dir, key + '.md');
			const subdirPath = resolve(dir, key);
			const mdExists = existsSync(mdPath) && statSync(mdPath).isFile();
			const subdirExists = existsSync(subdirPath) && statSync(subdirPath).isDirectory();
			if (!mdExists && subdirExists) {
				out.push({
					severity: 'warning',
					file: rel(scan.docsDir, meta),
					line: 1,
					message: `pages 中 "${key}" 实际指向子目录而非 ${key}.md（footgun，应删除此 key）`,
				});
			}
		}
	}
	return out;
}

// US-004 Rule B: meta-missing-title (warning)
// A key under pages: has no title: field set.
// Skip .pdf entries (PDFs may legitimately have no title).
function lintMetaMissingTitle(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	for (const meta of scan.metaFiles) {
		const dm = readDirMeta(meta);
		if (!dm?.pages) continue;
		for (const [key, page] of Object.entries(dm.pages)) {
			if (key.endsWith('.pdf')) continue;
			if (!page.title) {
				out.push({
					severity: 'warning',
					file: rel(scan.docsDir, meta),
					line: 1,
					message: `pages 中 "${key}" 缺少 title 字段`,
				});
			}
		}
	}
	return out;
}

// US-004 Rule C: meta-yaml-missing (warning)
// A directory contains at least one .md file but has no _meta.yaml.
// Skips the docsDir root itself.
function lintMetaYamlMissing(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	const { dirs, mds } = walkDocs(scan.docsDir);
	const mdSet = new Set(mds);
	for (const dir of dirs) {
		if (dir === scan.docsDir) continue; // skip root
		const metaPath = join(dir, '_meta.yaml');
		if (existsSync(metaPath)) continue;
		// Check if at least one .md file lives directly in this dir
		const hasMd = readdirSync(dir, { withFileTypes: true }).some(
			(e) => e.isFile() && e.name.endsWith('.md') && mdSet.has(join(dir, e.name)),
		);
		if (hasMd) {
			out.push({
				severity: 'warning',
				file: rel(scan.docsDir, dir),
				line: 1,
				message: '目录有 .md 文件但缺少 _meta.yaml',
			});
		}
	}
	return out;
}

// v2-prep Rule: meta-legacy-schema (warning)
// _meta.yaml uses the legacy `pages:` map. v2 will replace it with the new
// `children:` list schema. See docs/dev/next-major.md "已决定" → schema.
function lintMetaLegacySchema(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	for (const meta of scan.metaFiles) {
		let parsed: Record<string, unknown>;
		try {
			parsed = parseYaml(readFileSync(meta, 'utf-8'));
		} catch {
			continue; // malformed yaml — already reported by lintMetaConsistency
		}
		if ('pages' in parsed && parsed.pages !== undefined && parsed.pages !== null) {
			out.push({
				severity: 'warning',
				file: rel(scan.docsDir, meta),
				line: 1,
				message:
					'pages: 是 v1 schema，v2 将改用 children: 列表（运行 `zdoc fix --recipe=pages-to-children` 在 v2 开发期可机械迁移）',
			});
		}
	}
	return out;
}

// v2-prep Rule: meta-legacy-env-key (warning)
// `env:` field is renamed to `visibility:` in v2 (env: prod → visibility:
// prod-only). Walk the raw parseYaml result so we catch every occurrence
// (top-level, under pages.*, under children[]).
function lintMetaLegacyEnvKey(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	function hasEnvKey(obj: unknown): boolean {
		return !!obj && typeof obj === 'object' && !Array.isArray(obj) && 'env' in (obj as Record<string, unknown>);
	}
	for (const meta of scan.metaFiles) {
		let parsed: Record<string, unknown>;
		try {
			parsed = parseYaml(readFileSync(meta, 'utf-8'));
		} catch {
			continue;
		}
		const relPath = rel(scan.docsDir, meta);
		const baseMsg = '字段 env: 在 v2 已重命名为 visibility:（env: prod → visibility: prod-only）';

		// Top-level
		if (hasEnvKey(parsed)) {
			out.push({ severity: 'warning', file: relPath, line: 1, message: baseMsg });
		}

		// pages.*
		const pagesRaw = parsed.pages;
		if (pagesRaw && typeof pagesRaw === 'object' && !Array.isArray(pagesRaw)) {
			for (const [key, page] of Object.entries(pagesRaw as Record<string, unknown>)) {
				if (hasEnvKey(page)) {
					out.push({
						severity: 'warning',
						file: relPath,
						line: 1,
						message: `${baseMsg}（pages.${key}）`,
					});
				}
			}
		}

		// children[]
		const childrenRaw = parsed.children;
		if (Array.isArray(childrenRaw)) {
			childrenRaw.forEach((item, idx) => {
				if (!hasEnvKey(item)) return;
				const r = item as Record<string, unknown>;
				const label = typeof r.name === 'string' && r.name ? r.name : `[${idx}]`;
				out.push({
					severity: 'warning',
					file: relPath,
					line: 1,
					message: `${baseMsg}（children.${label}）`,
				});
			});
		}
	}
	return out;
}

// 2. Lifecycle target existence: superseded_by / folded_to must point to a
// file that exists. (Anchor validation deferred to v2.)
function lintLifecycleTargets(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	for (const meta of scan.metaFiles) {
		const dm = readDirMeta(meta);
		if (!dm?.pages) continue;
		const dir = dirname(meta);
		for (const [key, page] of Object.entries(dm.pages)) {
			if (page.superseded_by) {
				const target = resolveDocPath(scan.docsDir, dir, page.superseded_by);
				if (!target || !existsSync(target)) {
					out.push({
						severity: 'error',
						file: rel(scan.docsDir, meta),
						message: `${key}: superseded_by 目标 ${page.superseded_by} 不存在`,
					});
				}
			}
			if (page.folded_to) {
				const targetPathOnly = page.folded_to.split('#')[0];
				const target = resolveDocPath(scan.docsDir, dir, targetPathOnly);
				if (!target || !existsSync(target)) {
					out.push({
						severity: 'error',
						file: rel(scan.docsDir, meta),
						message: `${key}: folded_to 目标 ${targetPathOnly} 不存在`,
					});
				}
			}
		}
	}
	return out;
}

// Resolve a doc-style path. Accepted forms:
//   /docs/foo/bar.md   (absolute under docsDir; the leading `/docs/` prefix is optional)
//   /foo/bar.md        (absolute under docsDir)
//   ./bar.md           (relative to fromDir)
//   bar.md             (relative to fromDir)
function resolveDocPath(docsDir: string, fromDir: string, p: string): string | null {
	if (!p) return null;
	let path = p;
	// strip optional leading /docs/
	const docsPrefix = '/' + relative(dirname(docsDir), docsDir).split(sep).join('/') + '/';
	if (path.startsWith(docsPrefix)) {
		path = '/' + path.slice(docsPrefix.length);
	}
	if (path.startsWith('/')) {
		return resolve(docsDir, '.' + path);
	}
	return resolve(fromDir, path);
}

// 3. Internal markdown links: extract [text](path) and [text](path#anchor)
// patterns, verify file existence (anchor not validated in v1).
//
// Skips fenced code blocks (``` / ~~~) and inline code (`...`) — links inside
// code are documentation examples, not real references.
function lintInternalLinks(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	const linkRe = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	const fenceRe = /^\s*(```|~~~)/;
	const inlineCodeRe = /`[^`]*`/g;
	for (const md of scan.mdFiles) {
		const content = readFileSync(md, 'utf-8');
		const lines = content.split(/\r?\n/);
		let inFence = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (fenceRe.test(line)) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;
			const stripped = line.replace(inlineCodeRe, '');
			let m: RegExpExecArray | null;
			linkRe.lastIndex = 0;
			while ((m = linkRe.exec(stripped)) !== null) {
				const href = m[2];
				if (!isInternalDocLink(href)) continue;
				const pathOnly = href.split('#')[0];
				if (!pathOnly) continue; // pure anchor, same-page
				const target = resolveDocPath(scan.docsDir, dirname(md), pathOnly);
				if (!target || !existsSync(target)) {
					out.push({
						severity: 'error',
						file: rel(scan.docsDir, md),
						line: i + 1,
						message: `内部链接断裂: ${href}`,
					});
				}
			}
		}
	}
	return out;
}

function isInternalDocLink(href: string): boolean {
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false; // http:, mailto:, etc.
	if (href.startsWith('#')) return false;              // same-page anchor
	if (href.startsWith('//')) return false;             // protocol-relative
	if (href.startsWith('data:')) return false;
	return true;
}

// 5. Mermaid syntax: extract every ```mermaid fenced block and validate the
// body via mermaid.parse(). Covers all diagram types (mermaid routes to Jison
// or Langium internally — see docs/dev/reference/mermaid-lint.md). Errors are
// mapped back to the absolute line in the .md file by adding the fence-open
// offset to the parser-reported relative line.
//
// The mermaid module is lazy-imported: if no mermaid blocks exist anywhere in
// the scan, we never pay the import cost.
interface MermaidBlock {
	file: string;        // absolute md path
	fenceOpenLine: number; // 1-based line of the ```mermaid line in the md file
	body: string;        // fence body (lines between open and close, joined with \n)
}

function collectMermaidBlocks(scan: DocsScan): MermaidBlock[] {
	const blocks: MermaidBlock[] = [];
	// CommonMark: fence is 3+ backticks or 3+ tildes; close requires same char
	// type, length >= open, and no info string. This lets a 4-backtick fence
	// wrap 3-backtick fences as plain content (used in documentation that
	// quotes mermaid syntax).
	const fenceOpenRe = /^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;
	for (const md of scan.mdFiles) {
		const content = readFileSync(md, 'utf-8');
		const lines = content.split(/\r?\n/);
		let i = 0;
		while (i < lines.length) {
			const m = lines[i].match(fenceOpenRe);
			if (!m) {
				i++;
				continue;
			}
			const fenceStr = m[2];
			const fenceChar = fenceStr[0];
			const info = m[3];
			const fenceOpenLine = i + 1;
			const closeRe = new RegExp(
				`^\\s*${fenceChar === '`' ? '`' : '~'}{${fenceStr.length},}\\s*$`,
			);
			let j = i + 1;
			const bodyLines: string[] = [];
			let closed = false;
			while (j < lines.length) {
				if (closeRe.test(lines[j])) {
					closed = true;
					break;
				}
				bodyLines.push(lines[j]);
				j++;
			}
			if (closed && info.toLowerCase() === 'mermaid') {
				blocks.push({ file: md, fenceOpenLine, body: bodyLines.join('\n') });
			}
			i = closed ? j + 1 : i + 1;
		}
	}
	return blocks;
}

async function setupMermaidDom(): Promise<void> {
	// Mermaid 11 imports DOMPurify at module top level and calls addHook() for
	// several diagram chunks (class, state, gantt, mindmap, journey, …). Without
	// a window, DOMPurify is an uninitialized factory and addHook is undefined.
	// We attach a jsdom window to globalThis BEFORE importing mermaid so DOMPurify
	// auto-initializes against a real DOM. See docs/dev/reference/mermaid-lint.md.
	if ((globalThis as { window?: unknown }).window) return;
	const { JSDOM } = await import('jsdom');
	const dom = new JSDOM('');
	// Some globals are read-only in modern Node (e.g. `navigator` is a getter
	// from Node 21+). Use defineProperty with a try/catch so we skip
	// already-defined non-configurable ones instead of crashing.
	const setGlobal = (name: string, value: unknown) => {
		try {
			(globalThis as Record<string, unknown>)[name] = value;
		} catch {
			try {
				Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
			} catch {
				/* skip: built-in non-configurable; DOMPurify likely doesn't need it */
			}
		}
	};
	setGlobal('window', dom.window);
	setGlobal('document', dom.window.document);
	setGlobal('DOMParser', dom.window.DOMParser);
	setGlobal('Node', dom.window.Node);
	setGlobal('Element', dom.window.Element);
	setGlobal('HTMLElement', dom.window.HTMLElement);
	setGlobal('navigator', dom.window.navigator);
}

async function lintMermaidBlocks(scan: DocsScan): Promise<LintMessage[]> {
	const out: LintMessage[] = [];
	const blocks = collectMermaidBlocks(scan);
	if (blocks.length === 0) return out;

	// Lazy: only paid for when there's at least one mermaid block.
	await setupMermaidDom();
	const mermaidMod = await import('mermaid');
	const mermaid = (mermaidMod as { default?: { parse: (t: string) => Promise<unknown> } }).default
		?? (mermaidMod as unknown as { parse: (t: string) => Promise<unknown> });

	for (const b of blocks) {
		// Empty (no non-whitespace body) → warning, skip parser
		if (b.body.replace(/\s+/g, '') === '') {
			out.push({
				severity: 'warning',
				file: rel(scan.docsDir, b.file),
				line: b.fenceOpenLine,
				message: '空 mermaid block',
			});
			continue;
		}
		try {
			await mermaid.parse(b.body);
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			// Jison style: "Parse error on line N:" — N is 1-based within the body
			const ml = raw.match(/Parse error on line (\d+)/);
			let absLine = b.fenceOpenLine;
			if (ml) {
				// Jison's "Parse error on line N" reports where the parser
				// gave up. For garbage tokens N == body line K (the bad line).
				// For partial-match errors (e.g. `--!!` opens a LINK state then
				// fails on the next line) N can overflow past the body. Clamp
				// to the body's actual line count so we never point past the
				// closing fence. Pinned by the "invalid flowchart" test.
				const relLine = parseInt(ml[1], 10);
				const bodyLineCount = b.body.split(/\r?\n/).length;
				if (Number.isFinite(relLine) && relLine >= 1) {
					absLine = b.fenceOpenLine + Math.min(relLine, bodyLineCount);
				}
			}
			// Compact the error message: keep the first non-empty line plus any
			// "Expecting..." follow-up; strip the ASCII caret pointer line.
			const compact = raw
				.split(/\r?\n/)
				.filter((l) => l.trim() !== '' && !/^[-^\s]+\^[-^\s]*$/.test(l))
				.slice(0, 3)
				.join(' | ');
			out.push({
				severity: 'error',
				file: rel(scan.docsDir, b.file),
				line: absLine,
				message: `Mermaid 语法错误: ${compact}`,
			});
		}
	}
	return out;
}

// 6. EJS code blocks: validate ``` ejs fenced blocks at lint time.
// Reports:
//   • severity 'error'  when ejs.compile() throws (syntax error). Line points
//     at the fence-open line — we don't attempt to map back into the body.
//   • severity 'warning' for empty blocks (mirrors mermaid behavior).
//   • severity 'warning' for type conflicts: the same locals variable is used
//     both as a primitive (e.g. <%= x %>) and as an object (e.g. <%= x.foo %>)
//     in the same template — almost always an author mistake.
//   • Function-call-containing templates are silently skipped (they won't
//     get a runtime preview button either; matching that UX in lint avoids
//     warning fatigue for templates that intentionally use helpers).
interface EjsBlock {
	file: string;
	fenceOpenLine: number;
	body: string;
}

function collectEjsBlocks(scan: DocsScan): EjsBlock[] {
	const blocks: EjsBlock[] = [];
	const fenceOpenRe = /^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;
	for (const md of scan.mdFiles) {
		const content = readFileSync(md, 'utf-8');
		const lines = content.split(/\r?\n/);
		let i = 0;
		while (i < lines.length) {
			const m = lines[i].match(fenceOpenRe);
			if (!m) {
				i++;
				continue;
			}
			const fenceStr = m[2];
			const fenceChar = fenceStr[0];
			const info = m[3];
			const fenceOpenLine = i + 1;
			const closeRe = new RegExp(
				`^\\s*${fenceChar === '`' ? '`' : '~'}{${fenceStr.length},}\\s*$`,
			);
			let j = i + 1;
			const bodyLines: string[] = [];
			let closed = false;
			while (j < lines.length) {
				if (closeRe.test(lines[j])) {
					closed = true;
					break;
				}
				bodyLines.push(lines[j]);
				j++;
			}
			if (closed && info.toLowerCase() === 'ejs') {
				blocks.push({ file: md, fenceOpenLine, body: bodyLines.join('\n') });
			}
			i = closed ? j + 1 : i + 1;
		}
	}
	return blocks;
}

// Walk an AST recursively without acorn-walk to avoid an extra dependency
// surface in bin/. Calls `visit(node, parent)` for every object node.
function walkAst(root: unknown, visit: (n: Record<string, unknown> & { type?: string }, parent: Record<string, unknown> | null) => void): void {
	function go(n: unknown, parent: Record<string, unknown> | null) {
		if (!n || typeof n !== 'object') return;
		const node = n as Record<string, unknown> & { type?: string };
		if (node.type) visit(node, parent);
		for (const key of Object.keys(node)) {
			if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
			const v = node[key];
			if (Array.isArray(v)) for (const item of v) go(item, node);
			else if (v && typeof v === 'object') go(v, node);
		}
	}
	go(root, null);
}

// EJS-internal identifiers that should be ignored when looking for user data.
const EJS_BIN_INTERNALS = new Set([
	'__output', '__append', '__line', 'escapeFn', 'include', 'rethrow',
	'locals', 'undefined', 'utils',
]);
const EJS_BIN_GLOBALS = new Set([
	'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Date',
	'NaN', 'Infinity', 'console',
]);

// Detect any user-defined function call (anything that's not an EJS internal).
function detectUserCall(ast: unknown): boolean {
	let found = false;
	walkAst(ast, (n) => {
		if (found) return;
		if (n.type !== 'CallExpression') return;
		const callee = n.callee as { type?: string; name?: string } | undefined;
		if (callee?.type === 'Identifier' && callee.name && EJS_BIN_INTERNALS.has(callee.name)) return;
		found = true;
	});
	return found;
}

// Find the user-code portion of the compiled body — the `with (locals || {})`
// block that EJS emits. Returns null if not present (template has no logic).
function findWithBody(ast: unknown): Record<string, unknown> | null {
	let found: Record<string, unknown> | null = null;
	walkAst(ast, (n) => {
		if (found) return;
		if (n.type === 'WithStatement') found = n.body as Record<string, unknown>;
	});
	return found;
}

// Type-conflict scan: track names used both as primitives and as object bases.
// Loop variable scopes are tracked so loop vars don't conflict with same-named
// top-level locals. Walks only the with-block body — EJS's outer wrapping
// function is skipped to avoid picking up internal identifiers.
function detectTypeConflicts(ast: unknown): string[] {
	const withBody = findWithBody(ast);
	if (!withBody) return [];

	const primitiveUse = new Set<string>();
	const objectUse = new Set<string>();
	const conflicts: string[] = [];

	const loopVarStack: Set<string>[] = [];

	function isLoopVarInScope(name: string): boolean {
		for (let i = loopVarStack.length - 1; i >= 0; i--) {
			if (loopVarStack[i].has(name)) return true;
		}
		return false;
	}

	function visit(n: unknown, parent: Record<string, unknown> | null) {
		if (!n || typeof n !== 'object') return;
		const node = n as Record<string, unknown> & { type?: string };

		// Push loop-var scope for For{In,Of}Statement.left and walk body separately
		if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
			const names = new Set<string>();
			const left = node.left as { type?: string; declarations?: Array<{ id?: { name?: string } }>; name?: string };
			if (left.type === 'VariableDeclaration') {
				for (const d of left.declarations ?? []) {
					if (d.id?.name) names.add(d.id.name);
				}
			} else if (left.type === 'Identifier' && left.name) {
				names.add(left.name);
			}
			// Walk right side in outer scope
			visit(node.right, node);
			// Walk body in inner scope
			loopVarStack.push(names);
			visit(node.body, node);
			loopVarStack.pop();
			return;
		}

		if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
			// Don't descend into nested function bodies; arguments/scope would
			// require deeper analysis and shouldn't surface as user-locals.
			return;
		}

		if (node.type === 'Identifier') {
			const name = (node as { name?: string }).name;
			if (!name) return;
			if (EJS_BIN_INTERNALS.has(name) || EJS_BIN_GLOBALS.has(name)) return;
			if (isLoopVarInScope(name)) return;

			const p = parent;
			// Skip identifiers that are the (non-computed) property of MemberExpression
			if (p && p.type === 'MemberExpression' && (p as { property?: unknown }).property === node && !(p as { computed?: boolean }).computed) {
				return;
			}
			// Skip identifiers that are the binding side of a declarator
			if (p && (p.type === 'VariableDeclarator') && (p as { id?: unknown }).id === node) return;
			if (p && (p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') && (p as { id?: unknown }).id === node) return;

			// Now: is this identifier the OBJECT of a MemberExpression (with prop access)?
			const isObjectUse = !!p && p.type === 'MemberExpression' && (p as { object?: unknown }).object === node;
			if (isObjectUse) objectUse.add(name);
			else primitiveUse.add(name);
			return;
		}

		// Default: recurse with current node as parent
		for (const key of Object.keys(node)) {
			if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
			const v = node[key];
			if (Array.isArray(v)) for (const item of v) visit(item, node);
			else if (v && typeof v === 'object') visit(v, node);
		}
	}

	visit(withBody, null);

	for (const name of primitiveUse) {
		if (objectUse.has(name)) conflicts.push(name);
	}
	return conflicts;
}

async function lintEjsBlocks(scan: DocsScan): Promise<LintMessage[]> {
	const out: LintMessage[] = [];
	const blocks = collectEjsBlocks(scan);
	if (blocks.length === 0) return out;

	const ejsMod = await import('ejs');
	const ejs = (ejsMod as { default?: { Template: unknown } }).default ?? (ejsMod as unknown as { Template: unknown });
	const acornMod = await import('acorn');
	// Cast through unknown: acorn's strict Options type requires ecmaVersion, but
	// we always pass it at the call site below; this keeps lint.ts self-contained
	// without depending on @types/acorn's full surface.
	const acornParse = acornMod.parse as unknown as (src: string, opts: Record<string, unknown>) => unknown;

	for (const b of blocks) {
		if (b.body.replace(/\s+/g, '') === '') {
			out.push({
				severity: 'warning',
				file: rel(scan.docsDir, b.file),
				line: b.fenceOpenLine,
				message: '空 ejs block',
			});
			continue;
		}
		// Step 1: compile with EJS (default opts → with-block) and grab the body
		let bodySource: string;
		try {
			const TemplateCtor = (ejs as { Template: new (s: string, o: Record<string, unknown>) => { source: string; compile: () => void } }).Template;
			const t = new TemplateCtor(b.body, {});
			t.compile();
			bodySource = t.source;
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			out.push({
				severity: 'error',
				file: rel(scan.docsDir, b.file),
				line: b.fenceOpenLine,
				message: `EJS 语法错误: ${raw.split('\n')[0]}`,
			});
			continue;
		}
		// Step 2: parse the compiled body to AST
		let ast: unknown;
		try {
			ast = acornParse(`function __wrap() {\n${bodySource}\n}`, { ecmaVersion: 'latest' });
		} catch (err) {
			out.push({
				severity: 'error',
				file: rel(scan.docsDir, b.file),
				line: b.fenceOpenLine,
				message: `EJS 编译产物解析失败: ${err instanceof Error ? err.message : String(err)}`,
			});
			continue;
		}
		// Step 3: silent skip if any user function call appears
		if (detectUserCall(ast)) continue;
		// Step 4: type-conflict scan
		const conflicts = detectTypeConflicts(ast);
		if (conflicts.length > 0) {
			out.push({
				severity: 'warning',
				file: rel(scan.docsDir, b.file),
				line: b.fenceOpenLine,
				message: `EJS 变量类型冲突（既作 string 又作 object 使用）: ${conflicts.join(', ')}`,
			});
		}
	}
	return out;
}

// 4. Folded blockquote convention: scan for `> 已折叠到 [text](href)` lines
// and validate the target file exists. Also skips fenced code blocks so
// documentation examples are not flagged.
function lintFoldedBlockquotes(scan: DocsScan): LintMessage[] {
	const out: LintMessage[] = [];
	const foldedRe = /^>\s*已折叠到\s*\[[^\]]*\]\(([^)\s]+)\)/;
	const fenceRe = /^\s*(```|~~~)/;
	for (const md of scan.mdFiles) {
		const content = readFileSync(md, 'utf-8');
		const lines = content.split(/\r?\n/);
		let inFence = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (fenceRe.test(line)) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;
			const m = line.match(foldedRe);
			if (!m) continue;
			const href = m[1];
			if (!isInternalDocLink(href)) continue;
			const pathOnly = href.split('#')[0];
			if (!pathOnly) continue;
			const target = resolveDocPath(scan.docsDir, dirname(md), pathOnly);
			if (!target || !existsSync(target)) {
				out.push({
					severity: 'error',
					file: rel(scan.docsDir, md),
					line: i + 1,
					message: `折叠 blockquote 链接断裂: ${href}`,
				});
			}
		}
	}
	return out;
}

// -----------------------------------------------------------------------------
// Public lint API + CLI runner
// -----------------------------------------------------------------------------

export interface LintReport {
	scan: DocsScan;
	messages: LintMessage[];
	errors: number;
	warnings: number;
}

export async function lintDocs(docsDir: string): Promise<LintReport> {
	const scan = scanDocs(docsDir);
	const messages: LintMessage[] = [
		...lintMetaConsistency(scan),
		...lintMetaSubdirAsFile(scan),
		...lintMetaMissingTitle(scan),
		...lintMetaYamlMissing(scan),
		...lintMetaLegacySchema(scan),
		...lintMetaLegacyEnvKey(scan),
		...lintLifecycleTargets(scan),
		...lintInternalLinks(scan),
		...lintFoldedBlockquotes(scan),
		...(await lintMermaidBlocks(scan)),
		...(await lintEjsBlocks(scan)),
	];
	const errors = messages.filter((m) => m.severity === 'error').length;
	const warnings = messages.filter((m) => m.severity === 'warning').length;
	return { scan, messages, errors, warnings };
}

function printHelp(): void {
	process.stdout.write(`Usage: zdoc lint [-d <docs-dir>]

Checks performed:
  • _meta.yaml consistency (pages list ↔ files on disk)
  • meta-subdir-as-file: pages key points to a directory, not a .md file
  • meta-missing-title: pages key has no title field
  • meta-yaml-missing: directory has .md files but no _meta.yaml
  • meta-legacy-schema: _meta.yaml uses v1 pages: (v2 → children:)
  • meta-legacy-env-key: env: field used (v2 → visibility:)
  • Internal markdown link existence
  • Lifecycle target existence (superseded_by / folded_to)
  • Folded blockquote convention ("> 已折叠到 [text](path)")
  • Mermaid 代码块语法（所有图类型）
  • EJS 代码块（语法 + 变量类型冲突）

Exits with code 1 if any errors are reported (warnings do not fail the run).
`);
}

export default async function runLint(argv: string[]): Promise<number> {
	let dir = '.';
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '-h' || a === '--help') {
			printHelp();
			return 0;
		} else if (a === '-d' || a === '--dir') {
			const v = argv[++i];
			if (!v) {
				process.stderr.write(`Error: missing value for ${a}\n`);
				return 1;
			}
			dir = v;
		} else {
			process.stderr.write(`Error: unknown lint argument: ${a}\n`);
			printHelp();
			return 1;
		}
	}

	const docsDir = resolve(process.cwd(), dir);
	if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
		process.stderr.write(`Error: docs directory not found: ${docsDir}\n`);
		return 1;
	}

	const report = await lintDocs(docsDir);

	const checked = report.scan.metaFiles.length;
	const indexed = report.scan.mdFiles.size;
	const mermaidCount = collectMermaidBlocks(report.scan).length;
	const ejsCount = collectEjsBlocks(report.scan).length;
	process.stdout.write(`✓ ${checked} _meta.yaml files checked\n`);
	process.stdout.write(`✓ ${indexed} markdown files indexed\n`);
	process.stdout.write(`✓ ${mermaidCount} mermaid blocks checked\n`);
	process.stdout.write(`✓ ${ejsCount} ejs blocks checked\n`);

	if (report.messages.length > 0) {
		process.stdout.write('\n');
	}
	for (const m of report.messages) {
		const sym = m.severity === 'error' ? '✗' : '⚠';
		const loc = m.line ? `${m.file}:${m.line}` : m.file;
		process.stdout.write(`${sym} ${loc}  ${m.message}\n`);
	}

	process.stdout.write(`\n${report.errors} errors, ${report.warnings} warnings\n`);
	return report.errors > 0 ? 1 : 0;
}

// Allow direct invocation: `node bin/lint.js [args]`
const __thisFile = import.meta.url;
const __invokedAs = process.argv[1] ? `file://${process.argv[1].replace(/\\/g, '/')}` : '';
if (__thisFile === __invokedAs || __invokedAs.endsWith('/bin/lint.js')) {
	runLint(process.argv.slice(2)).then((code) => process.exit(code));
}
