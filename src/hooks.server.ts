import type { Handle } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '$lib/config.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { resolveDocsAsset } from '$lib/docs-asset.js';
import { createSession, validateSession } from '$lib/sessions.js';

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

function tryServeAsset(pathname: string): Response | null {
	const asset = resolveDocsAsset(getDocsDir(), pathname);
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
		const asset = tryServeAsset(event.url.pathname);
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
		const asset = tryServeAsset(event.url.pathname);
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
