import { existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export const ASSET_MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.ico': 'image/x-icon',
};

export interface ResolvedAsset {
	filePath: string;
	mime: string;
}

export function resolveDocsAsset(docsDir: string, pathname: string): ResolvedAsset | null {
	const dot = pathname.lastIndexOf('.');
	if (dot < 0) return null;
	const ext = pathname.slice(dot).toLowerCase();
	const mime = ASSET_MIME[ext];
	if (!mime) return null;

	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}

	const root = resolve(docsDir);
	const target = resolve(root, '.' + decoded);
	if (target !== root && !target.startsWith(root + sep)) return null;
	if (!existsSync(target) || !statSync(target).isFile()) return null;

	return { filePath: target, mime };
}
