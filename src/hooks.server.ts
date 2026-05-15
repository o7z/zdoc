import type { Handle } from '@sveltejs/kit';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getConfig } from '$lib/config.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { resolveDocsAsset } from '$lib/docs-asset.js';
import { createSession, validateSession } from '$lib/sessions.js';
import { isSpecKitPath, stripSkPrefix, resolveDocsDir } from '$lib/mode.js';
import { buildSidebar } from '$lib/sidebar.js';
import { buildSearchIndex } from '$lib/search-index.js';
import { renderMarkdownCached } from '$lib/markdown.js';

// Pre-warm caches at process startup so the first user navigation already lands
// on warm caches. Runs once per Node worker; fire-and-forget so HTTP listening
// is not blocked. If preload fails partway, lazy paths still work.
async function preloadDocsCache(docsDir: string): Promise<void> {
	if (!docsDir || !existsSync(docsDir)) return;
	const label = `[zdoc preload] ${docsDir}`;
	const started = Date.now();
	try {
		buildSidebar(docsDir);
		await buildSearchIndex(docsDir);

		const mdFiles: string[] = [];
		const walk = (dir: string) => {
			let entries: ReturnType<typeof readdirSync>;
			try {
				entries = readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				if (e.name.startsWith('.')) continue;
				const full = join(dir, e.name);
				if (e.isDirectory()) walk(full);
				else if (e.isFile() && e.name.endsWith('.md')) mdFiles.push(full);
			}
		};
		walk(docsDir);

		// Render in parallel but cap concurrency so unified instances don't all
		// initialize at once on a small Node thread pool.
		const CONCURRENCY = 4;
		let cursor = 0;
		await Promise.all(
			Array.from({ length: CONCURRENCY }, async () => {
				while (cursor < mdFiles.length) {
					const i = cursor++;
					try {
						await renderMarkdownCached(mdFiles[i]);
					} catch {
						/* skip unreadable file */
					}
				}
			}),
		);

		const ms = Date.now() - started;
		console.log(`${label}: ${mdFiles.length} pages warmed in ${ms}ms`);
	} catch (err) {
		console.warn(`${label}: preload aborted`, err);
	}
}

void (async () => {
	const config = getConfig();
	preloadDocsCache(config.docsDir);
	if (config.specKitDir && existsSync(config.specKitDir)) {
		preloadDocsCache(config.specKitDir);
	}
})();

const FAVICON_NAMES = ['favicon.ico', 'favicon.png', 'favicon.svg', 'favicon.gif'];

const MIME: Record<string, string> = {
	'.ico': 'image/x-icon',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.gif': 'image/gif',
};

function tryFavicon(): Response | null {
	const docsDir = getDocsDir();
	for (const name of FAVICON_NAMES) {
		const filePath = join(docsDir, name);
		if (existsSync(filePath)) {
			const ext = name.slice(name.lastIndexOf('.'));
			return new Response(readFileSync(filePath), {
				headers: {
					'Content-Type': MIME[ext] ?? 'application/octet-stream',
					'Cache-Control': 'public, max-age=86400',
				},
			});
		}
	}
	return null;
}

function tryServeAsset(pathname: string, docsDir: string): Response | null {
	const asset = resolveDocsAsset(docsDir, pathname);
	if (!asset) return null;
	return new Response(readFileSync(asset.filePath), {
		headers: {
			'Content-Type': asset.mime,
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	// Favicon — public, no auth needed
	if (FAVICON_NAMES.some((n) => event.url.pathname === '/' + n)) {
		const resp = tryFavicon();
		if (resp) return resp;
	}

	const password = getConfig().password;

	if (!password) {
		const docsDir = resolveDocsDir(event.url.pathname) ?? getDocsDir();
		const asset = tryServeAsset(event.url.pathname, docsDir);
		if (asset) return asset;
		return resolve(event);
	}

	if (event.url.pathname === '/login' && event.request.method === 'POST') {
		const form = await event.request.formData();
		const pwd = form.get('password');

		if (pwd === password) {
			const { token, maxAge } = createSession();

			return new Response(null, {
				status: 303,
				headers: {
					'Set-Cookie': `docs_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
					Location: event.url.searchParams.get('redirect') || '/',
				},
			});
		}

		return new Response(loginPage(true, event.url.searchParams.get('redirect') || '/'), {
			status: 401,
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	}

	const cookieHeader = event.request.headers.get('cookie') || '';
	const match = cookieHeader.match(/docs_session=([^;]+)/);
	if (match && validateSession(match[1])) {
		const docsDir = resolveDocsDir(event.url.pathname) ?? getDocsDir();
		const asset = tryServeAsset(event.url.pathname, docsDir);
		if (asset) return asset;
		return resolve(event);
	}

	if (event.url.pathname === '/login') {
		return new Response(loginPage(false, event.url.searchParams.get('redirect') || '/'), {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	}

	const redirect = encodeURIComponent(event.url.pathname + event.url.search);
	return new Response(null, {
		status: 303,
		headers: { Location: `/login?redirect=${redirect}` },
	});
};

function loginPage(error: boolean, redirect: string): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;
background:#f9fafb;color:#1a1a2e}
.card{background:#fff;padding:48px 40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);
width:100%;max-width:380px;text-align:center}
h1{font-size:24px;margin-bottom:8px;font-weight:700}
p.sub{color:#6b7280;margin-bottom:32px;font-size:14px}
input{width:100%;padding:12px 16px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;
outline:none;transition:border-color .2s}
input:focus{border-color:#6366f1}
button{width:100%;padding:12px;margin-top:16px;background:#4f46e5;color:#fff;border:none;
border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}
button:hover{background:#4338ca}
.error{color:#dc2626;font-size:13px;margin-top:12px}
@media(prefers-color-scheme:dark){
body{background:#111;color:#e5e7eb}
.card{background:#1a1a2e;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
input{background:#111;color:#e5e7eb;border-color:#374151}
input:focus{border-color:#818cf8}
}
</style>
</head>
<body>
<div class="card">
<h1>Docs</h1>
<p class="sub">Enter password to continue</p>
<form method="POST" action="/login?redirect=${encodeURIComponent(redirect)}">
<input type="password" name="password" placeholder="Password" autofocus required>
<button type="submit">Enter</button>
${error ? '<p class="error">Incorrect password</p>' : ''}
</form>
</div>
</body>
</html>`;
}
