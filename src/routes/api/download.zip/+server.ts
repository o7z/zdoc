// /api/download.zip — streams the entire docs directory as a zip archive.
//
// Gated by config.downloadEnabled (see src/lib/config.ts). When disabled,
// returns 403; the header download button is also hidden in that case so
// the endpoint is invisible to end users unless explicitly opted in.
//
// Auth note: this route lives behind hooks.server.ts, so when the site has
// a password set, an unauthenticated request is redirected to /login by
// the hook *before* this handler runs — no extra auth code needed here.
//
// File selection rules (raw walk, NOT _meta.yaml-driven):
//   - Skip any entry whose name starts with '.' (hidden / dotfiles / .git)
//   - Skip symlinks (path-traversal & loop safety)
//   - Include everything else: .md, _meta.yaml, images, pdfs, attachments
//
// Compression: deflate for text/binary that compresses well, store-only
// for already-compressed binaries (png/jpg/etc) to avoid wasted CPU.

import { existsSync, readFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { getConfig } from '$lib/config.js';
import { getDocsDir } from '$lib/docs-dir.js';
import type { RequestHandler } from './$types';

// File extensions whose contents are already compressed; deflating again
// just burns CPU for ~0% gain. Use ZipPassThrough (store-only) for these.
const ALREADY_COMPRESSED = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif',
	'.pdf', '.zip', '.gz', '.bz2', '.xz', '.7z',
	'.mp3', '.mp4', '.m4a', '.mov', '.avi', '.mkv', '.webm',
	'.woff', '.woff2',
]);

function walkRaw(dir: string, root: string, out: string[]): void {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const full = join(dir, entry.name);
		// Defend against symlinks pointing outside docsDir or into loops.
		try {
			if (lstatSync(full).isSymbolicLink()) continue;
		} catch {
			continue;
		}
		// Confirm the resolved path is still under root (defense in depth).
		const rel = relative(root, full);
		if (rel.startsWith('..') || rel.startsWith(sep + '..')) continue;
		if (entry.isDirectory()) {
			walkRaw(full, root, out);
		} else if (entry.isFile()) {
			out.push(full);
		}
	}
}

function sanitizeFilename(s: string): string {
	const cleaned = (s || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
	return cleaned || 'docs';
}

function yyyymmdd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}${m}${day}`;
}

function extOf(path: string): string {
	const i = path.lastIndexOf('.');
	return i >= 0 ? path.slice(i).toLowerCase() : '';
}

export const GET: RequestHandler = () => {
	const config = getConfig();
	if (!config.downloadEnabled) {
		return new Response('Download disabled', {
			status: 403,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const docsDir = getDocsDir();
	if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
		return new Response('Docs directory not found', {
			status: 404,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const files: string[] = [];
	walkRaw(docsDir, docsDir, files);

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const zip = new Zip();
			zip.ondata = (err, data, final) => {
				if (err) {
					controller.error(err);
					return;
				}
				if (data && data.length > 0) controller.enqueue(data);
				if (final) controller.close();
			};

			try {
				for (const filePath of files) {
					const relPath = relative(docsDir, filePath).split(sep).join('/');
					const buf = readFileSync(filePath);
					const ext = extOf(filePath);
					const entry = ALREADY_COMPRESSED.has(ext)
						? new ZipPassThrough(relPath)
						: new ZipDeflate(relPath, { level: 6 });
					zip.add(entry);
					entry.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), true);
				}
				zip.end();
			} catch (e) {
				controller.error(e);
			}
		},
	});

	const filename = `${sanitizeFilename(config.title)}-${yyyymmdd(new Date())}.zip`;
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'private, no-store',
		},
	});
};
