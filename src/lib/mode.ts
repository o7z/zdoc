import { existsSync, statSync } from 'node:fs';
import { getConfig } from './config.js';

const SK_PREFIX = '/sk/';

export type DocMode = 'zdoc' | 'spec-kit';

export function isSpecKitPath(pathname: string): boolean {
	return pathname === '/sk' || pathname.startsWith(SK_PREFIX);
}

export function stripSkPrefix(pathname: string): string {
	if (pathname === '/sk') return '/index.md';
	if (pathname.startsWith(SK_PREFIX)) return pathname.slice(SK_PREFIX.length - 1);
	return pathname;
}

export function resolveDocsDir(pathname: string): string | null {
	if (isSpecKitPath(pathname)) {
		const config = getConfig();
		if (!config.specKitDir) return null;
		if (!existsSync(config.specKitDir)) return null;
		if (!statSync(config.specKitDir).isDirectory()) return null;
		return config.specKitDir;
	}
	return getConfig().docsDir;
}

export function isSpecKitAvailable(): boolean {
	const config = getConfig();
	if (!config.specKitDir) return false;
	if (!existsSync(config.specKitDir)) return false;
	try {
		return statSync(config.specKitDir).isDirectory();
	} catch {
		return false;
	}
}
