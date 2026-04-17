import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DocsConfig {
	title: string;
	docsDir: string;
	password: string;
	port: number;
}

interface FileConfig {
	title?: string;
	docsDir?: string;
	password?: string;
	port?: number;
}

const configPath = resolve(process.cwd(), 'config.json');

function readFileConfig(): FileConfig {
	if (!existsSync(configPath)) return {};
	try {
		return JSON.parse(readFileSync(configPath, 'utf-8')) as FileConfig;
	} catch {
		return {};
	}
}

function loadConfig(): DocsConfig {
	const file = readFileConfig();

	const docsDirRaw = process.env.ZDOC_DIR || file.docsDir || process.cwd();
	const title = process.env.ZDOC_TITLE || file.title || 'Docs';
	const password =
		process.env.ZDOC_PASSWORD !== undefined
			? process.env.ZDOC_PASSWORD
			: file.password !== undefined
				? file.password
				: '';
	const port = Number(process.env.PORT) || file.port || 8888;

	return {
		title,
		docsDir: resolve(docsDirRaw),
		password,
		port,
	};
}

let state: DocsConfig = loadConfig();
let sessionEpoch = 0;

export function getConfig(): DocsConfig {
	return state;
}

export function getSessionEpoch(): number {
	return sessionEpoch;
}

export function setPassword(next: string): void {
	state = { ...state, password: next };
	sessionEpoch += 1;

	if (existsSync(configPath)) {
		try {
			const current = readFileConfig();
			current.password = next;
			writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
		} catch {
			// Best-effort persistence; in-memory update still succeeded.
		}
	}
}
