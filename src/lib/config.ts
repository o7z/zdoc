import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DocsConfig {
	title: string;
	docsDir: string;
	password: string;
	port: number;
	downloadEnabled: boolean;
}

interface FileConfig {
	title?: string;
	docsDir?: string;
	password?: string;
	port?: number;
	downloadEnabled?: boolean;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function coerceBool(v: unknown): boolean | undefined {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'string') return TRUTHY.has(v.toLowerCase());
	return undefined;
}

const configPath = resolve(process.cwd(), 'zdoc.config.json');

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
	const envDownload = coerceBool(process.env.ZDOC_DOWNLOAD);
	const downloadEnabled = envDownload !== undefined ? envDownload : file.downloadEnabled === true;

	return {
		title,
		docsDir: resolve(docsDirRaw),
		password,
		port,
		downloadEnabled,
	};
}

const state: DocsConfig = loadConfig();

export function getConfig(): DocsConfig {
	return state;
}
