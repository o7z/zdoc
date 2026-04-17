import { createHash, randomBytes } from 'node:crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const secret = randomBytes(32).toString('hex');
const sessions = new Map<string, number>();

function hashToken(token: string): string {
	return createHash('sha256').update(token + secret).digest('hex');
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function pruneExpired(): void {
	const now = nowSeconds();
	for (const [hash, expires] of sessions) {
		if (expires <= now) sessions.delete(hash);
	}
}

export function createSession(): { token: string; maxAge: number } {
	pruneExpired();
	const token = randomBytes(24).toString('hex');
	sessions.set(hashToken(token), nowSeconds() + SESSION_TTL_SECONDS);
	return { token, maxAge: SESSION_TTL_SECONDS };
}

export function validateSession(token: string): boolean {
	const hash = hashToken(token);
	const expires = sessions.get(hash);
	if (expires === undefined) return false;
	if (expires <= nowSeconds()) {
		sessions.delete(hash);
		return false;
	}
	return true;
}
