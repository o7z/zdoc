import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_NAME = '@o7z/zdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getCurrentVersion(): string {
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

export async function getLatestVersion(): Promise<string | null> {
	const registry = process.env.ZDOC_REGISTRY ?? 'https://registry.npmjs.org';
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3000); // Reduced to 3s

	try {
		const res = await fetch(`${registry}/${PKG_NAME.replace(/^@/, '')}`, {
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