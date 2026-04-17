import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig, setPassword } from '$lib/config.js';

export const POST: RequestHandler = async ({ request }) => {
	let body: { current?: unknown; next?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'invalid_json' }, { status: 400 });
	}

	const current = typeof body.current === 'string' ? body.current : '';
	const next = typeof body.next === 'string' ? body.next : '';

	if (!next) {
		return json({ ok: false, error: 'empty_password' }, { status: 400 });
	}

	if (current !== getConfig().password) {
		return json({ ok: false, error: 'wrong_password' }, { status: 401 });
	}

	setPassword(next);
	return json({ ok: true });
};
