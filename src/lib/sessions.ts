import { createHash, randomBytes } from 'node:crypto';
import { getDb, getSecret, getEpoch } from './db.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function hashToken(token: string): string {
	return createHash('sha256')
		.update(token + getSecret())
		.digest('hex');
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

let prunedOnce = false;
function pruneExpiredOnce(): void {
	if (prunedOnce) return;
	prunedOnce = true;
	getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowSeconds());
}

export function createSession(): { token: string; maxAge: number } {
	pruneExpiredOnce();
	const token = randomBytes(24).toString('hex');
	const expires = nowSeconds() + SESSION_TTL_SECONDS;
	getDb()
		.prepare('INSERT INTO sessions (token_hash, epoch, expires_at) VALUES (?, ?, ?)')
		.run(hashToken(token), getEpoch(), expires);
	return { token, maxAge: SESSION_TTL_SECONDS };
}

export function validateSession(token: string): boolean {
	pruneExpiredOnce();
	const hash = hashToken(token);
	const row = getDb()
		.prepare('SELECT epoch, expires_at FROM sessions WHERE token_hash = ?')
		.get(hash) as { epoch: number; expires_at: number } | undefined;
	if (!row) return false;
	const valid = row.epoch === getEpoch() && row.expires_at > nowSeconds();
	if (!valid) {
		getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
	}
	return valid;
}
