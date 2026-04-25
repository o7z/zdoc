import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
	detectInstallMode,
	detectPmFromLockfile,
	detectPmFromUserAgent,
	detectDepSection,
	formatUpgradeHint,
	type InstallMode,
} from './install-mode.ts';

const PKG = '@o7z/zdoc';

let tmp: string;
beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), 'zdoc-install-mode-'));
});
afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

describe('detectInstallMode — npx-temp', () => {
	test('npm npx cache path → npx-temp/npm', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.npm/_npx/abc123/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'npx-temp', pm: 'npm' });
	});

	test('bunx cache path → npx-temp/bun', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.bun/install/cache/@o7z/zdoc@1.7.1@@@1/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'npx-temp', pm: 'bun' });
	});

	test('pnpm dlx tmp path → npx-temp/pnpm', () => {
		const r = detectInstallMode({
			zdocPath: '/tmp/dlx-7af3b2/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'npx-temp', pm: 'pnpm' });
	});
});

describe('detectInstallMode — global', () => {
	test('/usr/local/lib/node_modules → global/npm', () => {
		const r = detectInstallMode({
			zdocPath: '/usr/local/lib/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'npm' });
	});

	test('/usr/lib/node_modules → global/npm', () => {
		const r = detectInstallMode({
			zdocPath: '/usr/lib/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'npm' });
	});

	test('nvm node prefix → global/npm', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.nvm/versions/node/v22.5.0/lib/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'npm' });
	});

	test('Windows AppData/Roaming/npm → global/npm', () => {
		const r = detectInstallMode({
			zdocPath: 'C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@o7z\\zdoc\\bin\\cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'npm' });
	});

	test('bun install global → global/bun', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.bun/install/global/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'bun' });
	});

	test('pnpm Linux global → global/pnpm', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.local/share/pnpm/global/5/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'pnpm' });
	});

	test('Windows AppData/Local/pnpm/global → global/pnpm', () => {
		const r = detectInstallMode({
			zdocPath: 'C:\\Users\\u\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@o7z\\zdoc\\bin\\cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'pnpm' });
	});

	test('Volta-managed npm shim → global/npm', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.volta/bin/zdoc',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'npm' });
	});

	test('yarn classic global → global/yarn', () => {
		const r = detectInstallMode({
			zdocPath: '/home/u/.config/yarn/global/node_modules/@o7z/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'global', pm: 'yarn' });
	});
});

describe('detectInstallMode — local-dep with lockfile signaling', () => {
	function makeLocalProject(lockFiles: string[], depSection: 'dependencies' | 'devDependencies' | null) {
		for (const f of lockFiles) {
			writeFileSync(join(tmp, f), '');
		}
		const pkg: Record<string, unknown> = { name: 'host' };
		if (depSection === 'dependencies') pkg.dependencies = { [PKG]: '^1.0.0' };
		if (depSection === 'devDependencies') pkg.devDependencies = { [PKG]: '^1.0.0' };
		writeFileSync(join(tmp, 'package.json'), JSON.stringify(pkg));
		const zdocPath = join(tmp, 'node_modules', '@o7z', 'zdoc', 'bin', 'cli.js');
		mkdirSync(join(tmp, 'node_modules', '@o7z', 'zdoc', 'bin'), { recursive: true });
		return zdocPath;
	}

	test('bun.lock + devDependencies', () => {
		const z = makeLocalProject(['bun.lock'], 'devDependencies');
		const r = detectInstallMode({ zdocPath: z, cwd: tmp, pkgName: PKG });
		expect(r).toEqual({ kind: 'local-dep', pm: 'bun', section: 'devDependencies' });
	});

	test('bun.lockb + devDependencies', () => {
		const z = makeLocalProject(['bun.lockb'], 'devDependencies');
		const r = detectInstallMode({ zdocPath: z, cwd: tmp, pkgName: PKG });
		expect(r).toEqual({ kind: 'local-dep', pm: 'bun', section: 'devDependencies' });
	});

	test('pnpm-lock.yaml + dependencies', () => {
		const z = makeLocalProject(['pnpm-lock.yaml'], 'dependencies');
		const r = detectInstallMode({ zdocPath: z, cwd: tmp, pkgName: PKG });
		expect(r).toEqual({ kind: 'local-dep', pm: 'pnpm', section: 'dependencies' });
	});

	test('yarn.lock + devDependencies', () => {
		const z = makeLocalProject(['yarn.lock'], 'devDependencies');
		const r = detectInstallMode({ zdocPath: z, cwd: tmp, pkgName: PKG });
		expect(r).toEqual({ kind: 'local-dep', pm: 'yarn', section: 'devDependencies' });
	});

	test('package-lock.json + dependencies', () => {
		const z = makeLocalProject(['package-lock.json'], 'dependencies');
		const r = detectInstallMode({ zdocPath: z, cwd: tmp, pkgName: PKG });
		expect(r).toEqual({ kind: 'local-dep', pm: 'npm', section: 'dependencies' });
	});

	test('no dep entry → defaults to devDependencies', () => {
		const z = makeLocalProject(['package-lock.json'], null);
		const r = detectInstallMode({ zdocPath: z, cwd: tmp, pkgName: PKG });
		expect(r).toEqual({ kind: 'local-dep', pm: 'npm', section: 'devDependencies' });
	});
});

describe('detectInstallMode — unknown', () => {
	test('arbitrary path with no lockfile, no node_modules layout → unknown', () => {
		const r = detectInstallMode({
			zdocPath: '/random/path/somewhere/zdoc/bin/cli.js',
			cwd: tmp,
			pkgName: PKG,
		});
		expect(r).toEqual({ kind: 'unknown' });
	});
});

describe('detectPmFromLockfile', () => {
	test('returns null when no lockfile', () => {
		expect(detectPmFromLockfile(tmp)).toBeNull();
	});
});

describe('detectDepSection', () => {
	test('returns null when no package.json', () => {
		expect(detectDepSection(tmp, PKG)).toBeNull();
	});
	test('handles malformed package.json gracefully', () => {
		writeFileSync(join(tmp, 'package.json'), '{ not valid json');
		expect(detectDepSection(tmp, PKG)).toBeNull();
	});
});

describe('formatUpgradeHint output', () => {
	test('npx-temp returns empty string', () => {
		const out = formatUpgradeHint({ kind: 'npx-temp', pm: 'bun' }, PKG, '1.0.0', '1.1.0');
		expect(out).toBe('');
	});

	test('global npm uses "i -g" not "add -g"', () => {
		const out = formatUpgradeHint({ kind: 'global', pm: 'npm' }, PKG, '1.0.0', '1.1.0');
		expect(out).toContain('npm i -g @o7z/zdoc@latest');
		expect(out).not.toMatch(/\bnpm add\b/);
	});

	test('global yarn uses "yarn global add"', () => {
		const out = formatUpgradeHint({ kind: 'global', pm: 'yarn' }, PKG, '1.0.0', '1.1.0');
		expect(out).toContain('yarn global add @o7z/zdoc@latest');
	});

	test('local pnpm devDependencies uses "pnpm add -D"', () => {
		const out = formatUpgradeHint(
			{ kind: 'local-dep', pm: 'pnpm', section: 'devDependencies' },
			PKG,
			'1.0.0',
			'1.1.0',
		);
		expect(out).toContain('pnpm add -D @o7z/zdoc@latest');
	});

	test('local npm dependencies uses "npm i" without -D', () => {
		const out = formatUpgradeHint(
			{ kind: 'local-dep', pm: 'npm', section: 'dependencies' },
			PKG,
			'1.0.0',
			'1.1.0',
		);
		expect(out).toContain('npm i @o7z/zdoc@latest');
		expect(out).not.toMatch(/\bnpm add\b/);
		expect(out).not.toContain('-D');
	});

	test('unknown returns all 4 pm names', () => {
		const out = formatUpgradeHint({ kind: 'unknown' }, PKG, '1.0.0', '1.1.0');
		expect(out).toContain('npm i -D @o7z/zdoc@latest');
		expect(out).toContain('pnpm add -D @o7z/zdoc@latest');
		expect(out).toContain('yarn add -D @o7z/zdoc@latest');
		expect(out).toContain('bun add -D @o7z/zdoc@latest');
	});

	test('Bug 2 regression: never emit "npm add"', () => {
		const modes: InstallMode[] = [
			{ kind: 'global', pm: 'npm' },
			{ kind: 'local-dep', pm: 'npm', section: 'dependencies' },
			{ kind: 'local-dep', pm: 'npm', section: 'devDependencies' },
			{ kind: 'unknown' },
		];
		for (const m of modes) {
			const out = formatUpgradeHint(m, PKG, '1.0.0', '1.1.0');
			expect(out).not.toMatch(/\bnpm add\b/);
		}
	});

	test('all commands include @latest suffix', () => {
		const modes: InstallMode[] = [
			{ kind: 'global', pm: 'npm' },
			{ kind: 'global', pm: 'pnpm' },
			{ kind: 'global', pm: 'yarn' },
			{ kind: 'global', pm: 'bun' },
			{ kind: 'local-dep', pm: 'pnpm', section: 'devDependencies' },
			{ kind: 'unknown' },
		];
		for (const m of modes) {
			const out = formatUpgradeHint(m, PKG, '1.0.0', '1.1.0');
			expect(out).toContain('@latest');
		}
	});
});
