import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { getDocsDir } from './docs-dir.js';

interface Statement {
	get(...args: unknown[]): unknown;
	all(...args: unknown[]): unknown[];
	run(...args: unknown[]): unknown;
}

interface Db {
	exec(sql: string): unknown;
	prepare(sql: string): Statement;
}

const requireFn = createRequire(import.meta.url);

function newDatabase(path: string): Db {
	const procVer = (globalThis as { process?: { versions?: Record<string, string> } }).process
		?.versions;
	if (procVer?.bun) {
		const { Database } = requireFn('bun:sqlite') as { Database: new (p: string) => Db };
		return new Database(path);
	}
	const mod = requireFn('better-sqlite3') as { default?: new (p: string) => Db } & (new (
		p: string,
	) => Db);
	const Ctor = (mod as { default?: new (p: string) => Db }).default ?? mod;
	return new (Ctor as new (p: string) => Db)(path);
}

let dbInstance: Db | null = null;

export function getDb(): Db {
	if (dbInstance) return dbInstance;

	const dbPath = join(getDocsDir(), '.zdoc', 'zdoc.db');
	if (!existsSync(dirname(dbPath))) {
		mkdirSync(dirname(dbPath), { recursive: true });
	}

	const db = newDatabase(dbPath);
	db.exec('PRAGMA journal_mode = WAL');

	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			token_hash TEXT PRIMARY KEY,
			epoch INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
		CREATE TABLE IF NOT EXISTS kv (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`);

	if (!db.prepare('SELECT 1 FROM kv WHERE key = ?').get('session_secret')) {
		db.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run(
			'session_secret',
			randomBytes(32).toString('hex'),
		);
	}
	if (!db.prepare('SELECT 1 FROM kv WHERE key = ?').get('session_epoch')) {
		db.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('session_epoch', '0');
	}

	dbInstance = db;
	return db;
}

function getKv(key: string): string | null {
	const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as
		| { value: string }
		| undefined;
	return row ? row.value : null;
}

function setKv(key: string, value: string): void {
	getDb().prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
}

export function getSecret(): string {
	return getKv('session_secret')!;
}

export function getEpoch(): number {
	return Number(getKv('session_epoch') ?? '0');
}

export function bumpEpoch(): number {
	const next = getEpoch() + 1;
	setKv('session_epoch', String(next));
	return next;
}
