#!/usr/bin/env node
// zdoc fix — auto-fix docs structure issues.
//
// Foundation only (US-001): wires up the CLI surface, engine scan/apply
// loop, dry-run/--apply gating, and --recipe filter. The 5 planned
// recipes (register-orphan, remove-subdir-as-file, derive-missing-title,
// scaffold-meta-yaml, prune-missing-page) ship in later stories; this
// story keeps the RECIPES array empty so the framework can be exercised
// end-to-end without the noise of actual rewrites.

import { existsSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { apply, applyToString, scan, RECIPES } from './fix/engine.js';
import { unifiedDiff } from './fix/diff.js';
import type { Finding } from './fix/types.js';

// Planned recipe IDs + their one-line zh-CN descriptions. Listed here so
// --help can advertise the full surface even before all stories ship.
// When a recipe is implemented its entry will move into engine.ts's
// RECIPES array, and this list becomes the documented spec only.
const PLANNED_RECIPE_IDS: ReadonlyArray<{ id: string; description: string }> = [
	{ id: 'register-orphan', description: '把孤儿 .md 自动登记到父级 _meta.yaml' },
	{ id: 'remove-subdir-as-file', description: '删除把子目录误写成 page key 的条目' },
	{ id: 'derive-missing-title', description: '从首个 H1 推导缺失的 title' },
	{ id: 'scaffold-meta-yaml', description: '为只有 .md 但缺 _meta.yaml 的目录生成 _meta.yaml' },
	{ id: 'prune-missing-page', description: '列出 pages 指向的不存在文件（仅提示，不自动修）' },
];

const FORMAT_NOTICE = '提示：zdoc fix 会重新格式化 _meta.yaml — 注释和空行将丢失。';

function printHelp(): void {
	let msg = `Usage: zdoc fix [options]

默认行为：dry-run。打印将会发生的变更，即使发现问题也以退出码 0 结束。

Options:
  -d, --dir <path>       Docs directory (默认: ./docs 若存在，否则当前目录)
      --apply, -y        实际写入磁盘（默认仅 dry-run）
      --dry-run          显式 dry-run（与默认行为等价）
      --recipe <id>      仅运行指定 recipe（单个值，逗号分隔不支持）
  -h, --help             显示本帮助

Recipes:
`;
	for (const { id, description } of PLANNED_RECIPE_IDS) {
		msg += `  ${id.padEnd(24)} ${description}\n`;
	}
	msg += `
Exit codes:
  0  dry-run 完成，或 --apply 时所有写入成功
  1  --apply 时至少一个写入失败
  2  参数错误、docs 目录不存在，或未知的 --recipe id
`;
	process.stdout.write(msg);
}

interface ParsedArgs {
	help: boolean;
	dir: string | null;       // null → caller picks default (./docs vs cwd)
	apply: boolean;
	dryRun: boolean;          // explicit flag; informational only
	recipeId: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
	const out: ParsedArgs = {
		help: false,
		dir: null,
		apply: false,
		dryRun: false,
		recipeId: null,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '-h' || a === '--help') {
			out.help = true;
		} else if (a === '-d' || a === '--dir') {
			const v = argv[++i];
			if (!v) throw new Error(`Missing value for ${a}`);
			out.dir = v;
		} else if (a === '--apply' || a === '-y') {
			out.apply = true;
		} else if (a === '--dry-run') {
			out.dryRun = true;
		} else if (a === '--recipe') {
			const v = argv[++i];
			if (!v) throw new Error(`Missing value for --recipe`);
			out.recipeId = v;
		} else if (a.startsWith('--recipe=')) {
			const v = a.slice('--recipe='.length);
			if (!v) throw new Error(`Missing value for --recipe`);
			out.recipeId = v;
		} else if (a.startsWith('--dir=')) {
			out.dir = a.slice('--dir='.length);
		} else {
			throw new Error(`Unknown argument: ${a}`);
		}
	}
	return out;
}

function pickDefaultDir(cwd: string): string {
	const docs = resolve(cwd, 'docs');
	if (existsSync(docs) && statSync(docs).isDirectory()) return docs;
	return cwd;
}

function isValidRecipeId(id: string): boolean {
	if (RECIPES.some((r) => r.id === id)) return true;
	return PLANNED_RECIPE_IDS.some((r) => r.id === id);
}

function groupFindingsByFile(findings: Finding[]): Map<string, Finding[]> {
	const out = new Map<string, Finding[]>();
	for (const f of findings) {
		const arr = out.get(f.file) ?? [];
		arr.push(f);
		out.set(f.file, arr);
	}
	return out;
}

export default async function runFix(argv: string[]): Promise<number> {
	let args: ParsedArgs;
	try {
		args = parseArgs(argv);
	} catch (err) {
		process.stderr.write(`Error: ${(err as Error).message}\n\n`);
		printHelp();
		return 2;
	}

	if (args.help) {
		printHelp();
		return 0;
	}

	const cwd = process.cwd();
	const docsDirRaw = args.dir ?? pickDefaultDir(cwd);
	const docsDir = resolve(cwd, docsDirRaw);

	if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
		process.stderr.write(`Error: docs directory not found: ${docsDir}\n`);
		return 2;
	}

	if (args.recipeId !== null && !isValidRecipeId(args.recipeId)) {
		process.stderr.write(`Error: unknown --recipe id: ${args.recipeId}\n`);
		process.stderr.write(`Available recipes: ${PLANNED_RECIPE_IDS.map((r) => r.id).join(', ')}\n`);
		return 2;
	}

	// Always print the reformat notice — both dry-run and --apply paths.
	process.stdout.write(`${FORMAT_NOTICE}\n\n`);

	const result = scan(docsDir, args.recipeId ? { recipeId: args.recipeId } : {});

	if (result.findings.length === 0) {
		process.stdout.write('没有需要修复的问题。\n');
		return 0;
	}

	// Split into auto-fixable vs manual-review.
	const auto = result.findings.filter((f) => !f.manualReview);
	const manual = result.findings.filter((f) => f.manualReview);

	if (!args.apply) {
		// --- DRY-RUN PATH ---

		// Compute per-file diffs without writing to disk.
		const previews = applyToString(result);

		for (const [file, preview] of previews) {
			if (preview.failedReason) {
				process.stdout.write(`✗ ${file}   ${preview.failedReason}\n\n`);
				continue;
			}
			if (preview.before === preview.after && !preview.isNewFile) continue;

			// For new files use /dev/null as "before" path (git convention).
			// unifiedDiff always emits "--- a/<path>" so we need a workaround:
			// pass empty string for before and fix up the header afterwards.
			if (preview.isNewFile) {
				// Build a diff that shows the new file content as pure additions.
				const relPath = relative(docsDir, file).replace(/\\/g, '/');
				const afterLines = preview.after.split('\n');
				if (afterLines[afterLines.length - 1] === '') afterLines.pop();
				const count = afterLines.length;
				let diffOut = `--- /dev/null\n+++ b/${relPath}\n`;
				diffOut += `@@ -0,0 +1,${count} @@\n`;
				for (const line of afterLines) {
					diffOut += `+${line}\n`;
				}
				process.stdout.write(diffOut + '\n');
			} else {
				const relPath = relative(docsDir, file).replace(/\\/g, '/');
				const diffOut = unifiedDiff(relPath, preview.before, preview.after);
				if (diffOut) process.stdout.write(diffOut + '\n');
			}
		}

		// Manual-review section.
		if (manual.length > 0) {
			process.stdout.write(`需要人工裁决（${manual.length} 项）：\n`);
			const grouped = groupFindingsByFile(manual);
			for (const [file, findings] of grouped) {
				process.stdout.write(`\n  ${file}\n`);
				for (const f of findings) {
					process.stdout.write(`    • [${f.recipeId}] ${f.message}\n`);
				}
			}
			process.stdout.write('\n');
		}

		// Count files that would actually be modified (non-noop previews).
		const modifiedCount = [...previews.values()].filter(
			(p) => !p.failedReason && (p.isNewFile || p.before !== p.after),
		).length;
		const autoCount = auto.length;
		const manualCount = manual.length;
		process.stdout.write(
			`\n汇总：${modifiedCount} 个文件待修改，${autoCount} 项自动修复，${manualCount} 项需人工裁决。\n`,
		);

		return 0;
	}

	// --- APPLY PATH ---
	const applied = apply(result);

	for (const w of applied.written) {
		const recipeLabel = w.recipeIds.join(', ');
		process.stdout.write(`✓ ${w.file}   ${recipeLabel} (${w.recipeIds.length} fixes)\n`);
	}
	for (const f of applied.failed) {
		process.stdout.write(`✗ ${f.file}   ${f.reason}\n`);
	}

	const modifiedCount = applied.written.length;
	const autoCount = auto.length;
	const manualCount = manual.length;
	process.stdout.write(
		`\n汇总：${modifiedCount} 个文件待修改，${autoCount} 项自动修复，${manualCount} 项需人工裁决。\n`,
	);

	if (applied.failed.length > 0) return 1;
	return 0;
}

// Allow direct invocation: `node bin/fix.js [args]`
const __thisFile = import.meta.url;
const __invokedAs = process.argv[1] ? `file://${process.argv[1].replace(/\\/g, '/')}` : '';
if (__thisFile === __invokedAs || __invokedAs.endsWith('/bin/fix.js')) {
	runFix(process.argv.slice(2)).then((code) => process.exit(code));
}
