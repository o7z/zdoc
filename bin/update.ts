import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { detectPM, type DetectResult } from './pm.js';

const PKG_NAME = '@o7z/zdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

export interface UpdateCheckResult {
	needsUpdate: boolean;
	current: string;
	latest: string | null;
	pm: DetectResult | null;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
	const pm = detectPM();
	const latest = await fetchLatestVersion();
	const current = getCurrentVersion();

	if (!latest || !semverGt(latest, current)) {
		return { needsUpdate: false, current, latest, pm };
	}

	return { needsUpdate: true, current, latest, pm };
}

export async function performUpdate(pm: DetectResult): Promise<boolean> {
	try {
		execSync(pm.installCmd, { stdio: 'inherit', timeout: 60000 });
		return true;
	} catch {
		return false;
	}
}

export { getCurrentVersion };
