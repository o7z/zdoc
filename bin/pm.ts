import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PMInfo {
	name: PackageManager;
	globalCmd: string;
	localCmd: string;
	binCmd: string;
}

const PM_COMMANDS: Record<PackageManager, PMInfo> = {
	npm:  { name: 'npm',  globalCmd: 'npm i -g @o7z/zdoc',       localCmd: 'npm i @o7z/zdoc',       binCmd: 'npm'  },
	pnpm: { name: 'pnpm', globalCmd: 'pnpm add -g @o7z/zdoc',     localCmd: 'pnpm add @o7z/zdoc',     binCmd: 'pnpm' },
	yarn: { name: 'yarn', globalCmd: 'yarn global add @o7z/zdoc',  localCmd: 'yarn add @o7z/zdoc',     binCmd: 'yarn' },
	bun:  { name: 'bun',  globalCmd: 'bun add -g @o7z/zdoc',       localCmd: 'bun add @o7z/zdoc',      binCmd: 'bun'  },
};

const LOCK_FILES: Record<string, PackageManager> = {
	'package-lock.json': 'npm',
	'pnpm-lock.yaml':    'pnpm',
	'yarn.lock':         'yarn',
	'bun.lockb':         'bun',
	'bun.lock':          'bun',
};

function detectFromUserAgent(): PackageManager | null {
	const ua = process.env.npm_config_user_agent ?? '';
	if (ua.startsWith('bun'))  return 'bun';
	if (ua.startsWith('pnpm')) return 'pnpm';
	if (ua.startsWith('yarn')) return 'yarn';
	if (ua.startsWith('npm'))  return 'npm';
	return null;
}

function detectFromArgv1(): PackageManager | null {
	const binPath = process.argv[1] ?? '';
	if (/[\\/]\.bun[\\/]/.test(binPath) || /[\\/]bun[\\/]install[\\/]/.test(binPath)) return 'bun';
	if (/[\\/]\.pnpm[\\/]/.test(binPath) || /[\\/]pnpm[\\/]/.test(binPath)) return 'pnpm';
	if (/[\\/]\.yarn[\\/]/.test(binPath) || /[\\/]yarn[\\/]/.test(binPath)) return 'yarn';
	if (/[\\/]npm[\\/]/.test(binPath)) return 'npm';
	return null;
}

function detectFromLockFile(cwd: string): PackageManager | null {
	for (const [file, pm] of Object.entries(LOCK_FILES)) {
		if (existsSync(resolve(cwd, file))) return pm;
	}
	return null;
}

function detectFromPackageManagerField(cwd: string): PackageManager | null {
	const pkgPath = resolve(cwd, 'package.json');
	if (!existsSync(pkgPath)) return null;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { packageManager?: string };
		const field = pkg.packageManager;
		if (!field) return null;
		const name = field.split('@')[0] as PackageManager;
		if (name in PM_COMMANDS) return name;
	} catch {}
	return null;
}

function isGlobalInstall(): boolean {
	const binPath = resolve(process.argv[1] ?? '');
	const cwd = process.cwd();
	if (!binPath.startsWith(cwd)) return true;
	const nodeModulesIdx = binPath.indexOf('node_modules');
	if (nodeModulesIdx === -1) return true;
	return !binPath.substring(0, nodeModulesIdx).startsWith(cwd);
}

export interface DetectResult {
	pm: PackageManager;
	global: boolean;
	installCmd: string;
	binCmd: string;
}

export function detectPM(cwd?: string): DetectResult | null {
	const dir = cwd ?? process.cwd();
	const global = isGlobalInstall();

	let pm: PackageManager | null = null;

	if (global) {
		pm = detectFromUserAgent() ?? detectFromArgv1();
	} else {
		pm = detectFromPackageManagerField(dir) ?? detectFromLockFile(dir) ?? detectFromUserAgent() ?? detectFromArgv1();
	}

	if (!pm) return null;

	const info = PM_COMMANDS[pm];
	return {
		pm,
		global,
		installCmd: global ? info.globalCmd : info.localCmd,
		binCmd: info.binCmd,
	};
}