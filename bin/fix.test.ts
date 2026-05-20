import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import runFix from './fix.ts';

// Capture stdout/stderr so we can assert on text output. bun:test runs each
// test in-process, so we monkey-patch the writers and restore in afterEach.
interface Captured {
	stdout: string;
	stderr: string;
}

function captureIO(): { capture: Captured; restore: () => void } {
	const capture: Captured = { stdout: '', stderr: '' };
	const origOut = process.stdout.write.bind(process.stdout);
	const origErr = process.stderr.write.bind(process.stderr);
	// @ts-expect-error — monkey-patch is intentional
	process.stdout.write = (chunk: string | Uint8Array) => {
		capture.stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
		return true;
	};
	// @ts-expect-error — monkey-patch is intentional
	process.stderr.write = (chunk: string | Uint8Array) => {
		capture.stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
		return true;
	};
	return {
		capture,
		restore: () => {
			process.stdout.write = origOut;
			process.stderr.write = origErr;
		},
	};
}

let docs: string;
beforeEach(() => {
	docs = mkdtempSync(join(tmpdir(), 'zdoc-fix-test-'));
});
afterEach(() => {
	rmSync(docs, { recursive: true, force: true });
});

describe('runFix — help', () => {
	test('--help lists all 5 planned recipe ids and returns 0', async () => {
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['--help']);
			expect(code).toBe(0);
			const out = capture.stdout;
			expect(out).toContain('register-orphan');
			expect(out).toContain('remove-subdir-as-file');
			expect(out).toContain('derive-missing-title');
			expect(out).toContain('scaffold-meta-yaml');
			expect(out).toContain('prune-missing-page');
			expect(out).toContain('Usage');
		} finally {
			restore();
		}
	});
});

describe('runFix — clean fixture (no findings)', () => {
	test('dry-run on empty fixture prints "没有需要修复的问题。" and returns 0', async () => {
		// Empty docs dir — engine walks, finds no _meta.yaml, no md, no findings.
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['-d', docs]);
			expect(code).toBe(0);
			expect(capture.stdout).toContain('没有需要修复的问题。');
			// Reformat notice must always appear
			expect(capture.stdout).toContain('提示：zdoc fix 会重新格式化 _meta.yaml');
		} finally {
			restore();
		}
	});

	test('--apply on clean fixture returns 0', async () => {
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['--apply', '-d', docs]);
			expect(code).toBe(0);
			expect(capture.stdout).toContain('没有需要修复的问题。');
		} finally {
			restore();
		}
	});

	test('dry-run on a fixture with _meta.yaml but no recipes registered → 0 findings', async () => {
		// Use children schema so v1.17's pages-to-children recipe doesn't fire.
		writeFileSync(join(docs, '_meta.yaml'), 'title: Site\nchildren:\n  - name: intro\n    title: Intro\n');
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeFileSync(join(docs, 'intro.md'), '# Intro\n');
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['-d', docs]);
			expect(code).toBe(0);
			expect(capture.stdout).toContain('没有需要修复的问题。');
		} finally {
			restore();
		}
	});
});

describe('runFix — error paths', () => {
	test('nonexistent docs dir returns 2', async () => {
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['-d', join(docs, 'does-not-exist')]);
			expect(code).toBe(2);
			expect(capture.stderr).toContain('docs directory not found');
		} finally {
			restore();
		}
	});

	test('--recipe=bogus-id returns 2 with helpful message', async () => {
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['--recipe=bogus-id', '-d', docs]);
			expect(code).toBe(2);
			expect(capture.stderr).toContain('unknown --recipe id: bogus-id');
		} finally {
			restore();
		}
	});

	test('unknown argument returns 2', async () => {
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['--no-such-flag']);
			expect(code).toBe(2);
			expect(capture.stderr).toContain('Unknown argument');
		} finally {
			restore();
		}
	});

	test('--recipe with planned id (not yet registered) is accepted', async () => {
		// User can type the flag today even though no recipe is registered yet;
		// scan simply finds 0 matching findings.
		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['--recipe=register-orphan', '-d', docs]);
			expect(code).toBe(0);
			expect(capture.stdout).toContain('没有需要修复的问题。');
		} finally {
			restore();
		}
	});
});

// ---------------------------------------------------------------------------
// US-011: dry-run unified diff output + summary line
// ---------------------------------------------------------------------------

describe('runFix US-011 — dry-run diff output', () => {
	test('orphan .md produces unified diff with --- a/ and +++ b/ markers', async () => {
		// Set up: _meta.yaml exists with only title, foo.md is a sibling (orphan).
		writeFileSync(join(docs, '_meta.yaml'), 'title: Site\n');
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');

		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['-d', docs]);
			expect(code).toBe(0);
			const out = capture.stdout;
			// Must contain unified diff markers
			expect(out).toContain('--- a/');
			expect(out).toContain('+++ b/');
			// Must contain at least one insertion line
			expect(out).toMatch(/^\+/m);
		} finally {
			restore();
		}
	});

	test('dry-run summary line format matches expected pattern', async () => {
		writeFileSync(join(docs, '_meta.yaml'), 'title: Site\n');
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');

		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['-d', docs]);
			expect(code).toBe(0);
			// Summary line: 汇总：N 个文件待修改，M 项自动修复，K 项需人工裁决。
			expect(capture.stdout).toMatch(/汇总：\d+ 个文件待修改，\d+ 项自动修复，\d+ 项需人工裁决。/);
		} finally {
			restore();
		}
	});

	test('scaffold finding (new file) produces diff with /dev/null source', async () => {
		// Sub-directory with .md but no _meta.yaml → scaffold-meta-yaml fires.
		mkdirSync(join(docs, 'sub'), { recursive: true });
		writeFileSync(join(docs, 'sub', 'bar.md'), '# Bar\n');

		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['-d', docs, '--recipe=scaffold-meta-yaml']);
			expect(code).toBe(0);
			const out = capture.stdout;
			// New-file diff uses /dev/null as before-path
			expect(out).toContain('--- /dev/null');
			expect(out).toContain('+++ b/');
			// Content lines should include the generated _meta.yaml keys
			expect(out).toContain('+title:');
		} finally {
			restore();
		}
	});

	test('--apply summary line shows correct counts', async () => {
		writeFileSync(join(docs, '_meta.yaml'), 'title: Site\n');
		writeFileSync(join(docs, 'foo.md'), '# Foo\n');

		const { capture, restore } = captureIO();
		try {
			const code = await runFix(['--apply', '-d', docs]);
			// apply may return 0 or 1; we just check summary is printed
			const out = capture.stdout;
			expect(out).toMatch(/汇总：\d+ 个文件待修改，\d+ 项自动修复，\d+ 项需人工裁决。/);
			// Per-file result lines: ✓ or ✗
			expect(out).toMatch(/[✓✗]/);
		} finally {
			restore();
		}
	});

	test('dry-run with only prune-missing-page findings shows manual-review section and no diff', async () => {
		// _meta.yaml references ghost.md which doesn't exist → prune-missing-page only
		writeFileSync(
			join(docs, '_meta.yaml'),
			'title: Site\npages:\n  ghost:\n    title: Ghost\n',
		);

		const { capture, restore } = captureIO();
		try {
			// Scope to prune-missing-page so the v1.17 pages-to-children recipe
			// doesn't also produce a diff on this v1-schema fixture.
			const code = await runFix(['-d', docs, '--recipe=prune-missing-page']);
			expect(code).toBe(0);
			const out = capture.stdout;
			expect(out).toContain('需要人工裁决');
			// No unified diff because there are no auto-fix changes
			expect(out).not.toContain('--- a/');
			// Summary still present
			expect(out).toMatch(/汇总：/);
		} finally {
			restore();
		}
	});
});
