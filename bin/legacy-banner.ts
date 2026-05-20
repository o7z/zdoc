// zdoc serve/dev 启动时检查 v1 schema 残留。
// v2 lint 已经把 pages: / env: 升级为 error,所以 build / CI 用户跑 lint
// 已经会被强制提示。本 helper 是 serve / dev 本地启动时的友好提示 —
// 用户可能没显式跑 lint,但启动 dev 服务时一眼看到醒目 banner,知道该
// 跑 `zdoc fix --apply` 完成迁移。
//
// 不修改任何文件 (用户偏好:默认 dry-run 提示,不自动改盘)。

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseYaml } from './meta-mini.js';

interface LegacyHit {
	file: string;
	kind: 'pages' | 'env';
	where: string; // location label (top-level / pages.<key> / children[idx])
}

function walkMetaFiles(docsDir: string): string[] {
	const out: string[] = [];
	function visit(dir: string) {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (e.name.startsWith('.')) continue;
			const p = join(dir, e.name);
			if (e.isDirectory()) {
				visit(p);
			} else if (e.isFile() && e.name === '_meta.yaml') {
				out.push(p);
			}
		}
	}
	if (existsSync(docsDir) && statSync(docsDir).isDirectory()) visit(docsDir);
	return out;
}

function hasEnvKey(obj: unknown): boolean {
	return (
		!!obj &&
		typeof obj === 'object' &&
		!Array.isArray(obj) &&
		'env' in (obj as Record<string, unknown>)
	);
}

/**
 * Scan a docs directory for v1 schema usages (pages: top-level or env:
 * field at any position). Returns the list of hits — empty when clean.
 */
export function scanLegacyHits(docsDir: string): LegacyHit[] {
	const hits: LegacyHit[] = [];
	for (const metaPath of walkMetaFiles(docsDir)) {
		let parsed: Record<string, unknown>;
		try {
			parsed = parseYaml(readFileSync(metaPath, 'utf-8'));
		} catch {
			continue; // malformed YAML — lint reports separately
		}
		const rel = relative(docsDir, metaPath).split(sep).join('/') || '_meta.yaml';

		if ('pages' in parsed && parsed.pages !== undefined && parsed.pages !== null) {
			hits.push({ file: rel, kind: 'pages', where: 'top-level' });
		}
		if (hasEnvKey(parsed)) {
			hits.push({ file: rel, kind: 'env', where: 'top-level' });
		}
		const pagesRaw = parsed.pages;
		if (pagesRaw && typeof pagesRaw === 'object' && !Array.isArray(pagesRaw)) {
			for (const [key, page] of Object.entries(pagesRaw as Record<string, unknown>)) {
				if (hasEnvKey(page)) hits.push({ file: rel, kind: 'env', where: `pages.${key}` });
			}
		}
		const childrenRaw = parsed.children;
		if (Array.isArray(childrenRaw)) {
			childrenRaw.forEach((item, idx) => {
				if (!hasEnvKey(item)) return;
				const r = item as Record<string, unknown>;
				const label = typeof r.name === 'string' && r.name ? r.name : `[${idx}]`;
				hits.push({ file: rel, kind: 'env', where: `children.${label}` });
			});
		}
	}
	return hits;
}

/**
 * Print a visible banner to stderr if v1 schema usages are present.
 * Returns true when a banner was printed (caller may want to know).
 * Silent when docs/ is clean.
 */
export function printLegacySchemaBannerIfNeeded(docsDir: string): boolean {
	const hits = scanLegacyHits(docsDir);
	if (hits.length === 0) return false;

	const pagesHits = hits.filter((h) => h.kind === 'pages');
	const envHits = hits.filter((h) => h.kind === 'env');

	const lines: string[] = [];
	lines.push('');
	lines.push('═══════════════════════════════════════════════════════════════════');
	lines.push('  ⚠️  v2 schema 迁移提示');
	lines.push('───────────────────────────────────────────────────────────────────');
	if (pagesHits.length > 0) {
		const files = [...new Set(pagesHits.map((h) => h.file))];
		lines.push(`  检测到 ${files.length} 个 _meta.yaml 仍使用 v1 \`pages:\` schema:`);
		for (const f of files.slice(0, 5)) lines.push(`    • ${f}`);
		if (files.length > 5) lines.push(`    • ... 还有 ${files.length - 5} 个`);
		lines.push('');
		lines.push('  运行: zdoc fix --recipe=pages-to-children --apply');
	}
	if (envHits.length > 0) {
		if (pagesHits.length > 0) lines.push('');
		const files = [...new Set(envHits.map((h) => h.file))];
		lines.push(`  检测到 ${envHits.length} 处 \`env:\` 字段使用 (跨 ${files.length} 个文件)`);
		lines.push('  运行: zdoc fix --recipe=env-to-visibility --apply');
	}
	lines.push('');
	lines.push('  不自动改盘 — 跑上述命令完成迁移。');
	lines.push('═══════════════════════════════════════════════════════════════════');
	lines.push('');

	process.stderr.write(lines.join('\n'));
	return true;
}
