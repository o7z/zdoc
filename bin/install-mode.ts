import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export type Pm = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type InstallMode =
	| { kind: 'npx-temp'; pm: Pm }
	| { kind: 'global'; pm: Pm }
	| { kind: 'local-dep'; pm: Pm; section: 'dependencies' | 'devDependencies' }
	| { kind: 'unknown' };

function normalize(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

function isNpxTemp(zdocPath: string): Pm | null {
	const p = normalize(zdocPath);
	if (p.includes('/_npx/')) return 'npm';
	if (p.includes('/.bun/install/cache/')) return 'bun';
	if (/\/dlx-[a-z0-9]+\//.test(p)) return 'pnpm';
	return null;
}

function isGlobal(zdocPath: string): Pm | null {
	const p = normalize(zdocPath);
	if (p.includes('/.bun/install/global/')) return 'bun';
	if (p.includes('/.local/share/pnpm/global/') || p.includes('/appdata/local/pnpm/global/')) {
		return 'pnpm';
	}
	if (p.includes('/.config/yarn/global/') || p.includes('/appdata/local/yarn/data/global/')) {
		return 'yarn';
	}
	if (
		p.match(/\/usr\/(local\/)?lib\/node_modules\//) ||
		p.includes('/appdata/roaming/npm/node_modules/') ||
		p.match(/\/\.nvm\/versions\/node\/[^/]+\/lib\/node_modules\//) ||
		p.match(/\/\.nodenv\/versions\/[^/]+\/lib\/node_modules\//) ||
		p.match(/\/\.fnm\/node-versions\/[^/]+\/installation\/lib\/node_modules\//) ||
		p.match(/\/\.volta\/tools\/image\/packages\//) ||
		p.includes('/.volta/bin/')
	) {
		return 'npm';
	}
	return null;
}

function isLocalDep(zdocPath: string, cwd: string): boolean {
	const localPrefix = resolve(cwd, 'node_modules') + sep;
	return zdocPath.startsWith(localPrefix);
}

export function detectPmFromLockfile(cwd: string): Pm | null {
	if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun';
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
	if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
	if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';
	return null;
}

export function detectPmFromUserAgent(): Pm | null {
	const ua = process.env.npm_config_user_agent ?? '';
	if (ua.startsWith('pnpm')) return 'pnpm';
	if (ua.startsWith('yarn')) return 'yarn';
	if (ua.startsWith('bun')) return 'bun';
	if (ua.startsWith('npm')) return 'npm';
	return null;
}

export function detectDepSection(
	cwd: string,
	pkgName: string,
): 'dependencies' | 'devDependencies' | null {
	const pkgPath = join(cwd, 'package.json');
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		if (pkg.devDependencies?.[pkgName]) return 'devDependencies';
		if (pkg.dependencies?.[pkgName]) return 'dependencies';
	} catch {
		// missing or malformed package.json — fine, return null
	}
	return null;
}

export interface DetectArgs {
	zdocPath: string;
	cwd: string;
	pkgName: string;
}

export function detectInstallMode({ zdocPath, cwd, pkgName }: DetectArgs): InstallMode {
	const tempPm = isNpxTemp(zdocPath);
	if (tempPm) return { kind: 'npx-temp', pm: tempPm };

	const globalPm = isGlobal(zdocPath);
	if (globalPm) return { kind: 'global', pm: globalPm };

	if (isLocalDep(zdocPath, cwd)) {
		const pm = detectPmFromLockfile(cwd) ?? detectPmFromUserAgent() ?? 'npm';
		const section = detectDepSection(cwd, pkgName) ?? 'devDependencies';
		return { kind: 'local-dep', pm, section };
	}

	return { kind: 'unknown' };
}

function globalCmd(pm: Pm, pkg: string): string {
	switch (pm) {
		case 'npm':
			return `npm i -g ${pkg}@latest`;
		case 'pnpm':
			return `pnpm add -g ${pkg}@latest`;
		case 'yarn':
			return `yarn global add ${pkg}@latest`;
		case 'bun':
			return `bun add -g ${pkg}@latest`;
	}
}

function localCmd(pm: Pm, pkg: string, dev: boolean): string {
	const flag = dev ? ' -D' : '';
	switch (pm) {
		case 'npm':
			return `npm i${flag} ${pkg}@latest`;
		case 'pnpm':
			return `pnpm add${flag} ${pkg}@latest`;
		case 'yarn':
			return `yarn add${flag} ${pkg}@latest`;
		case 'bun':
			return `bun add${flag} ${pkg}@latest`;
	}
}

export function formatUpgradeHint(
	mode: InstallMode,
	pkgName: string,
	currentVersion: string,
	latestVersion: string,
): string {
	if (mode.kind === 'npx-temp') return '';

	const lines: string[] = [
		'',
		'  ─────────────────────────────────────',
		`  Update available ${currentVersion} → ${latestVersion}`,
	];

	if (mode.kind === 'global') {
		lines.push(`  Run: ${globalCmd(mode.pm, pkgName)}`);
	} else if (mode.kind === 'local-dep') {
		lines.push(`  Run: ${localCmd(mode.pm, pkgName, mode.section === 'devDependencies')}`);
	} else {
		lines.push('  Run one of:');
		const pms: Pm[] = ['npm', 'pnpm', 'yarn', 'bun'];
		for (const pm of pms) {
			lines.push(`    • ${localCmd(pm, pkgName, true)}`);
		}
	}

	return lines.join('\n') + '\n';
}
