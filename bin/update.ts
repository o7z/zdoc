import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { detectPM, type DetectResult } from './pm.js';

const ONE_DAY = 24 * 60 * 60 * 1000;
const PKG_NAME = '@o7z/zdoc';

interface CacheData {
	lastCheck: number;
	latest: string | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function cacheDir(): string {
	const platform = process.platform;
	if (platform === 'win32') {
		const base = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? resolve(process.env.HOME ?? '~', 'AppData', 'Local');
		return resolve(base, 'zdoc');
	}
	const base = process.env.XDG_CACHE_HOME ?? resolve(process.env.HOME ?? '~', '.cache');
	return resolve(base, 'zdoc');
}

function cachePath(): string {
	return resolve(cacheDir(), 'update-check.json');
}

export function readCache(): CacheData | null {
	const p = cachePath();
	if (!existsSync(p)) return null;
	try {
		return JSON.parse(readFileSync(p, 'utf-8')) as CacheData;
	} catch {
		return null;
	}
}

function writeCache(data: CacheData): void {
	const dir = cacheDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(cachePath(), JSON.stringify(data));
}

function getCurrentVersion(): string {
	const pkgPath = resolve(__dirname, '..', 'package.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
	return pkg.version;
}

function semverGt(a: string, b: string): boolean {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
		if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
	}
	return false;
}

async function fetchLatestVersion(): Promise<string | null> {
	const registry = process.env.ZDOC_REGISTRY ?? 'https://registry.npmjs.org';
	const url = `${registry}/${encodeURIComponent(PKG_NAME).replace(/^%40/, '@')}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);

	try {
		const res = await fetch(url, {
			headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' },
			signal: controller.signal,
		});
		if (!res.ok) return null;
		const body = await res.json() as { 'dist-tags'?: { latest?: string } };
		return body?.['dist-tags']?.latest ?? null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export interface UpdateInfo {
	current: string;
	latest: string;
	pm: DetectResult;
}

export function checkUpdateSync(): UpdateInfo | null {
	const cache = readCache();
	if (!cache || !cache.latest) return null;

	const current = getCurrentVersion();
	if (!semverGt(cache.latest, current)) return null;

	const pm = detectPM();
	return { current, latest: cache.latest, pm };
}

export function spawnCheck(): void {
	const cache = readCache();
	if (cache && Date.now() - cache.lastCheck < ONE_DAY) return;

	const child = spawn(
		process.execPath,
		[resolve(__dirname, 'update-check.js')],
		{ detached: true, stdio: 'ignore' },
	);
	child.unref();
}

export { fetchLatestVersion, writeCache, getCurrentVersion };
