import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
	mkdtempSync,
	writeFileSync,
	mkdirSync,
	rmSync,
	readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { scan, apply, RECIPES } from './engine.ts';
import type { Recipe, Finding } from './types.ts';
import { sha256Hex, readDirMetaWithSha, dumpDirMeta } from './yaml-io.ts';

let docs: string;
beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-fix-engine-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
	// Defensive: reset RECIPES after each test (some tests push fakes)
	RECIPES.length = 0;
});

describe('engine.scan — empty fixture', () => {
	test('empty docs dir → empty findings, zero meta files', () => {
		const r = scan(docs);
		expect(r.findings).toEqual([]);
		expect(r.scan.metaFiles).toEqual([]);
		expect(r.scan.mdFiles.size).toBe(0);
		expect(r.sourceShas.size).toBe(0);
		expect(r.sources.size).toBe(0);
	});

	test('docs with _meta.yaml but no registered recipes → empty findings, sha present', () => {
		const metaBody = 'title: Site\npages:\n  intro:\n    title: Intro\n';
		writeFileSync(join(docs, '_meta.yaml'), metaBody);
		writeFileSync(join(docs, 'intro.md'), '# Intro\n');
		const r = scan(docs);
		expect(r.findings).toEqual([]);
		expect(r.scan.metaFiles.length).toBe(1);
		const metaPath = r.scan.metaFiles[0];
		expect(r.sourceShas.get(metaPath)).toBe(sha256Hex(metaBody));
		expect(r.sources.get(metaPath)).toBe(metaBody);
	});

	test('sha computed for every _meta.yaml in scan', () => {
		const a = 'title: A\n';
		const b = 'title: B\n';
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeFileSync(join(docs, '_meta.yaml'), a);
		writeFileSync(join(docs, 'sub', '_meta.yaml'), b);
		const r = scan(docs);
		expect(r.scan.metaFiles.length).toBe(2);
		for (const meta of r.scan.metaFiles) {
			expect(r.sourceShas.has(meta)).toBe(true);
			expect(r.sourceShas.get(meta)).toBe(sha256Hex(readFileSync(meta, 'utf-8')));
		}
	});
});

describe('engine.apply — no findings', () => {
	test('no findings → no-op, empty ApplyResult', () => {
		writeFileSync(join(docs, '_meta.yaml'), 'title: Site\n');
		const r = scan(docs);
		const applied = apply(r);
		expect(applied.written).toEqual([]);
		expect(applied.failed).toEqual([]);
	});
});

describe('engine.apply — sha mismatch', () => {
	test('file mutated on disk between scan and apply → failure recorded, no write', () => {
		const metaPath = join(docs, '_meta.yaml');
		const original = 'title: Site\npages:\n  intro:\n    title: Intro\n';
		writeFileSync(metaPath, original);

		// Register a fake recipe that rewrites the file content to a marker.
		const fakeRecipe: Recipe = {
			id: 'test-fake-recipe',
			description: 'test fake',
			autoFix: true,
			detect: () => [
				{ recipeId: 'test-fake-recipe', file: metaPath, message: 'fake' },
			],
			apply: (_f: Finding, _before: string) => 'REWRITTEN\n',
		};
		RECIPES.push(fakeRecipe);

		const r = scan(docs);
		expect(r.findings.length).toBe(1);

		// Mutate file out-of-band after scan
		writeFileSync(metaPath, 'title: TamperedExternally\n');

		const applied = apply(r);
		expect(applied.written).toEqual([]);
		expect(applied.failed.length).toBe(1);
		expect(applied.failed[0].file).toBe(metaPath);
		expect(applied.failed[0].reason).toContain('sha 不匹配');

		// And the file on disk still has the tampered content (we did NOT overwrite)
		expect(readFileSync(metaPath, 'utf-8')).toBe('title: TamperedExternally\n');
	});

	test('happy path: registered recipe + matching sha → file rewritten atomically', () => {
		const metaPath = join(docs, '_meta.yaml');
		const original = 'title: Site\n';
		writeFileSync(metaPath, original);

		const fakeRecipe: Recipe = {
			id: 'test-rewrite',
			description: 'test rewrite',
			autoFix: true,
			detect: () => [
				{ recipeId: 'test-rewrite', file: metaPath, message: 'will rewrite' },
			],
			apply: (_f: Finding, before: string) => before + '# appended\n',
		};
		RECIPES.push(fakeRecipe);

		const r = scan(docs);
		const applied = apply(r);
		expect(applied.failed).toEqual([]);
		expect(applied.written.length).toBe(1);
		expect(applied.written[0].file).toBe(metaPath);
		expect(applied.written[0].recipeIds).toEqual(['test-rewrite']);
		expect(readFileSync(metaPath, 'utf-8')).toBe('title: Site\n# appended\n');
	});

	test('manualReview finding → engine skips it in apply()', () => {
		const metaPath = join(docs, '_meta.yaml');
		writeFileSync(metaPath, 'title: Site\n');

		const readOnlyRecipe: Recipe = {
			id: 'test-readonly',
			description: 'read-only',
			autoFix: false,
			detect: () => [
				{ recipeId: 'test-readonly', file: metaPath, message: 'just a finding' },
			],
		};
		RECIPES.push(readOnlyRecipe);

		const r = scan(docs);
		expect(r.findings.length).toBe(1);
		expect(r.findings[0].manualReview).toBe(true);

		const applied = apply(r);
		expect(applied.written).toEqual([]);
		expect(applied.failed).toEqual([]);
		// File untouched
		expect(readFileSync(metaPath, 'utf-8')).toBe('title: Site\n');
	});
});

describe('yaml-io — readDirMetaWithSha', () => {
	test('returns meta + sha + source for an existing file', () => {
		const body = 'title: Site\npages:\n  intro:\n    title: Intro\n';
		const metaPath = join(docs, '_meta.yaml');
		writeFileSync(metaPath, body);
		const result = readDirMetaWithSha(metaPath);
		expect(result).not.toBeNull();
		expect(result!.source).toBe(body);
		expect(result!.sha).toBe(createHash('sha256').update(body, 'utf-8').digest('hex'));
		expect(result!.meta?.title).toBe('Site');
		expect(result!.meta?.pages?.intro?.title).toBe('Intro');
	});

	test('returns null when file does not exist', () => {
		expect(readDirMetaWithSha(join(docs, 'missing.yaml'))).toBeNull();
	});

	test('dumpDirMeta on empty meta returns a single newline', () => {
		expect(dumpDirMeta({})).toBe('\n');
	});
});

describe('engine.apply — isNewFile race guard', () => {
	test('scaffold target appearing on disk between scan and apply → failure recorded, no overwrite', () => {
		const metaPath = join(docs, '_meta.yaml');
		// At scan time the file does NOT exist; recipe will report a new-file finding.

		const fakeScaffold: Recipe = {
			id: 'test-scaffold',
			description: 'test scaffold',
			autoFix: true,
			detect: () => [
				{
					recipeId: 'test-scaffold',
					file: metaPath,
					message: 'scaffold a fresh meta',
					payload: { isNewFile: true },
				},
			],
			apply: () => 'title: Scaffolded\n',
		};
		RECIPES.push(fakeScaffold);

		const r = scan(docs);
		expect(r.findings.length).toBe(1);
		expect(r.findings[0].payload).toMatchObject({ isNewFile: true });

		// Race: someone else creates the file after scan but before apply
		writeFileSync(metaPath, 'title: PreExisting\n');

		const applied = apply(r);
		expect(applied.written).toEqual([]);
		expect(applied.failed.length).toBe(1);
		expect(applied.failed[0].file).toBe(metaPath);
		expect(applied.failed[0].reason).toContain('已被创建');

		// And the pre-existing file content is untouched
		expect(readFileSync(metaPath, 'utf-8')).toBe('title: PreExisting\n');
	});

	test('scaffold writes successfully when target absent at apply time', () => {
		const metaPath = join(docs, '_meta.yaml');

		const fakeScaffold: Recipe = {
			id: 'test-scaffold-happy',
			description: 'happy scaffold',
			autoFix: true,
			detect: () => [
				{
					recipeId: 'test-scaffold-happy',
					file: metaPath,
					message: 'scaffold',
					payload: { isNewFile: true },
				},
			],
			apply: () => 'title: Scaffolded\n',
		};
		RECIPES.push(fakeScaffold);

		const r = scan(docs);
		const applied = apply(r);
		expect(applied.failed).toEqual([]);
		expect(applied.written.length).toBe(1);
		expect(readFileSync(metaPath, 'utf-8')).toBe('title: Scaffolded\n');
	});
});
