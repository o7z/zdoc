#!/usr/bin/env node
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getLatestVersion, getCurrentVersion } from './update.js';
import { detectInstallMode, formatUpgradeHint } from './install-mode.js';
import { detectAiAgent, formatAgentHint } from './agent-detect.js';

interface Args {
	dir: string;
	port: number;
	password: string;
	title: string;
	download: boolean;
	help: boolean;
	version: boolean;
}

interface FileConfig {
	title?: string;
	docsDir?: string;
	password?: string;
	port?: number;
	downloadEnabled?: boolean;
}

const DEFAULTS = {
	dir: process.cwd(),
	port: 8888,
	password: '',
	title: 'Docs',
	download: false,
};

function printHelp(): void {
	const msg = `zdoc — Markdown docs server

Usage:
  zdoc [options]              Start the docs server
  zdoc lint [-d <docs-dir>]   Check docs for broken links and metadata issues
  zdoc mcp  [-d <docs-dir>]   Start a stdio MCP server (for AI hosts)

Options:
  -d, --dir <path>       Markdown docs directory (default: current working directory)
  -p, --port <number>    Port to listen on (default: 8888, auto-increments if busy)
  -t, --title <string>   Site title (default: Docs)
  -w, --password <pwd>   Access password (default: none, docs are public; set to enable auth)
  -D, --download         Enable docs zip download endpoint and header button (default: off)
  -h, --help             Show this help message
  -v, --version          Show version

Configuration precedence: CLI flags > zdoc.config.json (cwd) > defaults.
A zdoc.config.json in the current directory may define: title, docsDir, password, port, downloadEnabled.
`;
	process.stdout.write(msg);
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		dir: DEFAULTS.dir,
		port: DEFAULTS.port,
		password: DEFAULTS.password,
		title: DEFAULTS.title,
		download: DEFAULTS.download,
		help: false,
		version: false,
	};
	let dirSet = false;
	let portSet = false;
	let passwordSet = false;
	let titleSet = false;
	let downloadSet = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		switch (a) {
			case '-h':
			case '--help':
				args.help = true;
				break;
			case '-v':
			case '--version':
				args.version = true;
				break;
			case '-d':
			case '--dir': {
				const v = argv[++i];
				if (!v) throw new Error(`Missing value for ${a}`);
				args.dir = v;
				dirSet = true;
				break;
			}
			case '-p':
			case '--port': {
				const v = argv[++i];
				if (!v) throw new Error(`Missing value for ${a}`);
				const n = Number(v);
				if (!Number.isInteger(n) || n < 1 || n > 65535) {
					throw new Error(`Invalid port: ${v}`);
				}
				args.port = n;
				portSet = true;
				break;
			}
			case '-w':
			case '--password': {
				const v = argv[++i];
				if (v === undefined) throw new Error(`Missing value for ${a}`);
				args.password = v;
				passwordSet = true;
				break;
			}
			case '-t':
			case '--title': {
				const v = argv[++i];
				if (!v) throw new Error(`Missing value for ${a}`);
				args.title = v;
				titleSet = true;
				break;
			}
			case '-D':
			case '--download':
				args.download = true;
				downloadSet = true;
				break;
			default:
				throw new Error(`Unknown argument: ${a}`);
		}
	}

	(args as unknown as Record<string, boolean>).__dirSet = dirSet;
	(args as unknown as Record<string, boolean>).__portSet = portSet;
	(args as unknown as Record<string, boolean>).__passwordSet = passwordSet;
	(args as unknown as Record<string, boolean>).__titleSet = titleSet;
	(args as unknown as Record<string, boolean>).__downloadSet = downloadSet;
	return args;
}

function readConfigJson(cwd: string): FileConfig {
	const p = resolve(cwd, 'zdoc.config.json');
	if (!existsSync(p)) return {};
	try {
		return JSON.parse(readFileSync(p, 'utf-8')) as FileConfig;
	} catch {
		return {};
	}
}

function findFreePort(start: number): Promise<number> {
	return new Promise((res, rej) => {
		const tryPort = (port: number) => {
			if (port > 65535) {
				rej(new Error('No free port found'));
				return;
			}
			const srv = createServer();
			srv.once('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
					tryPort(port + 1);
				} else {
					rej(err);
				}
			});
			srv.once('listening', () => {
				const addr = srv.address();
				const actualPort = typeof addr === 'object' && addr ? addr.port : port;
				srv.close(() => res(actualPort));
			});
			srv.listen(port, '0.0.0.0');
		};
		tryPort(start);
	});
}

async function main(): Promise<void> {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const pkgPath = resolve(__dirname, '..', 'package.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string; repository?: { url?: string } };

	// Subcommand dispatch
	if (process.argv[2] === 'lint') {
		const { default: runLint } = await import('./lint.js');
		const code = await runLint(process.argv.slice(3));
		process.exit(code);
	}
	if (process.argv[2] === 'mcp') {
		const { default: runMcp } = await import('./mcp.js');
		const code = await runMcp(process.argv.slice(3));
		process.exit(code);
	}

	let args: Args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (err) {
		process.stderr.write(`Error: ${(err as Error).message}\n\n`);
		printHelp();
		process.exit(1);
	}

	if (args.help) {
		printHelp();
		return;
	}
	if (args.version) {
		process.stdout.write(`${pkg.version}\n`);
		return;
	}

	const dirSet = (args as unknown as Record<string, boolean>).__dirSet;
	const portSet = (args as unknown as Record<string, boolean>).__portSet;
	const passwordSet = (args as unknown as Record<string, boolean>).__passwordSet;
	const titleSet = (args as unknown as Record<string, boolean>).__titleSet;
	const downloadSet = (args as unknown as Record<string, boolean>).__downloadSet;

	const cwd = process.cwd();
	const fileConfig = readConfigJson(cwd);

	const docsDirRaw = dirSet ? args.dir : fileConfig.docsDir ?? DEFAULTS.dir;
	const docsDir = resolve(cwd, docsDirRaw);

	const startPort = portSet ? args.port : fileConfig.port ?? DEFAULTS.port;

	const password = passwordSet
		? args.password
		: fileConfig.password !== undefined
			? fileConfig.password
			: DEFAULTS.password;

	const title = titleSet ? args.title : fileConfig.title ?? DEFAULTS.title;
	const downloadEnabled = downloadSet
		? args.download
		: fileConfig.downloadEnabled === true;

	if (!existsSync(docsDir)) {
		process.stderr.write(`Error: docs directory not found: ${docsDir}\n`);
		process.exit(1);
	}

	const port = await findFreePort(startPort);

	process.env.ZDOC_DIR = docsDir;
	process.env.ZDOC_PASSWORD = password;
	process.env.ZDOC_TITLE = title;
	process.env.ZDOC_DOWNLOAD = downloadEnabled ? '1' : '0';
	process.env.ZDOC_VERSION = pkg.version;
	process.env.ZDOC_REPO_URL = pkg.repository?.url ?? '';
	process.env.PORT = String(port);
	process.env.HOST = process.env.HOST || '0.0.0.0';

	const buildEntry = resolve(__dirname, '..', 'build', 'index.js');
	if (!existsSync(buildEntry)) {
		process.stderr.write(
			`Error: server build not found at ${buildEntry}\nDid you run 'npm run build'?\n`,
		);
		process.exit(1);
	}

	process.stdout.write(`\n  zdoc v${pkg.version}\n`);
	process.stdout.write(`  ➜  Docs:     ${docsDir}\n`);
	process.stdout.write(`  ➜  Local:    http://localhost:${port}\n`);
	process.stdout.write(`  ➜  Password: ${password ? 'enabled' : 'disabled'}\n`);
	process.stdout.write(`  ➜  Download: ${downloadEnabled ? 'enabled' : 'disabled'}\n`);

	const agent = detectAiAgent();
	const agentHint = formatAgentHint(agent);
	if (agentHint) process.stdout.write(agentHint);

	// Check for updates (skip when ZDOC_NO_UPDATE_CHECK is set)
	if (!process.env.ZDOC_NO_UPDATE_CHECK) {
		const latest = await getLatestVersion();
		const current = getCurrentVersion();

		if (latest && current !== latest) {
			const mode = detectInstallMode({
				zdocPath: fileURLToPath(import.meta.url),
				cwd,
				pkgName: '@o7z/zdoc',
			});
			const hint = formatUpgradeHint(mode, '@o7z/zdoc', current, latest);
			if (hint) process.stdout.write(hint);
		}
	}
	process.stdout.write('\n');

	await import(pathToFileURL(buildEntry).href);
}

main().catch((err) => {
	process.stderr.write(`Fatal: ${(err as Error).stack ?? err}\n`);
	process.exit(1);
});
