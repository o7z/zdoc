#!/usr/bin/env node
// zdoc lint — markdown docs linter.
// Checks _meta.yaml consistency, internal link health, lifecycle metadata
// targets, and the folded-blockquote convention.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { readDirMeta } from './meta-mini.js';

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
			if (!existsSync(target) || !statSync(target).isFile()) {
				out.push({
					severity: 'error',
					file: rel(scan.docsDir, meta),
					message: `pages 列出 "${key}" 但 ${fileName} 不存在`,
				});
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
						severity: 'warning',
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
						severity: 'warning',
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

export function lintDocs(docsDir: string): LintReport {
	const scan = scanDocs(docsDir);
	const messages: LintMessage[] = [
		...lintMetaConsistency(scan),
		...lintLifecycleTargets(scan),
		...lintInternalLinks(scan),
		...lintFoldedBlockquotes(scan),
	];
	const errors = messages.filter((m) => m.severity === 'error').length;
	const warnings = messages.filter((m) => m.severity === 'warning').length;
	return { scan, messages, errors, warnings };
}

function printHelp(): void {
	process.stdout.write(`Usage: zdoc lint [-d <docs-dir>]

Checks performed:
  • _meta.yaml consistency (pages list ↔ files on disk)
  • Internal markdown link existence
  • Lifecycle target existence (superseded_by / folded_to)
  • Folded blockquote convention ("> 已折叠到 [text](path)")

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

	const report = lintDocs(docsDir);

	const checked = report.scan.metaFiles.length;
	const indexed = report.scan.mdFiles.size;
	process.stdout.write(`✓ ${checked} _meta.yaml files checked\n`);
	process.stdout.write(`✓ ${indexed} markdown files indexed\n`);

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
