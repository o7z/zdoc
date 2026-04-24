import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PMInfo {
	name: PackageManager;
	global: string;
	local: string;
}

const PM_COMMANDS: Record<PackageManager, PMInfo> = {
	npm:  { name: 'npm',  global: 'npm i -g',       local: 'npm i'       },
	pnpm: { name: 'pnpm', global: 'pnpm add -g',     local: 'pnpm add'    },
	yarn: { name: 'yarn', global: 'yarn global add',  local: 'yarn add'    },
	bun:  { name: 'bun',  global: 'bun add -g',       local: 'bun add'     },
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
	const rel = binPath.startsWith(cwd);
	if (!rel) return true;
	const nodeModulesIdx = binPath.indexOf('node_modules');
	if (nodeModulesIdx === -1) return true;
	return !binPath.substring(0, nodeModulesIdx).startsWith(cwd);
}

export interface DetectResult {
	pm: PackageManager;
	global: boolean;
	installCmd: string;
}

export function detectPM(cwd?: string): DetectResult {
	const dir = cwd ?? process.cwd();
	const global = isGlobalInstall();

	let pm: PackageManager | null = null;

	if (global) {
		pm = detectFromUserAgent() ?? detectFromArgv1();
	} else {
		pm = detectFromPackageManagerField(dir) ?? detectFromLockFile(dir) ?? detectFromUserAgent() ?? detectFromArgv1();
	}

	pm = pm ?? 'npm';

	const info = PM_COMMANDS[pm];
	return {
		pm,
		global,
		installCmd: global ? info.global : info.local,
	};
}
