#!/usr/bin/env node
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface Args {
	dir: string;
	port: number;
	password: string;
	help: boolean;
	version: boolean;
}

interface FileConfig {
	title?: string;
	docsDir?: string;
	password?: string;
	port?: number;
}

const DEFAULTS = {
	dir: process.cwd(),
	port: 8888,
	password: '',
};

function printHelp(): void {
	const msg = `zdoc — Markdown docs server

Usage:
  zdoc [options]

Options:
  -d, --dir <path>       Markdown docs directory (default: current working directory)
  -p, --port <number>    Port to listen on (default: 8888, auto-increments if busy)
  -w, --password <pwd>   Access password (default: none, docs are public; set to enable auth)
  -h, --help             Show this help message
  -v, --version          Show version

Configuration precedence: CLI flags > config.json (cwd) > defaults.
A config.json in the current directory may define: title, docsDir, password, port.
`;
	process.stdout.write(msg);
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		dir: DEFAULTS.dir,
		port: DEFAULTS.port,
		password: DEFAULTS.password,
		help: false,
		version: false,
	};
	let dirSet = false;
	let portSet = false;
	let passwordSet = false;

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
			default:
				throw new Error(`Unknown argument: ${a}`);
		}
	}

	(args as unknown as Record<string, boolean>).__dirSet = dirSet;
	(args as unknown as Record<string, boolean>).__portSet = portSet;
	(args as unknown as Record<string, boolean>).__passwordSet = passwordSet;
	return args;
}

function readConfigJson(cwd: string): FileConfig {
	const p = resolve(cwd, 'config.json');
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
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };

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

	const title = fileConfig.title ?? 'Docs';

	if (!existsSync(docsDir)) {
		process.stderr.write(`Error: docs directory not found: ${docsDir}\n`);
		process.exit(1);
	}

	const port = await findFreePort(startPort);

	process.env.ZDOC_DIR = docsDir;
	process.env.ZDOC_PASSWORD = password;
	process.env.ZDOC_TITLE = title;
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
	process.stdout.write(`  ➜  Password: ${password ? 'enabled' : 'disabled'}\n\n`);

	await import(pathToFileURL(buildEntry).href);
}

main().catch((err) => {
	process.stderr.write(`Fatal: ${(err as Error).stack ?? err}\n`);
	process.exit(1);
});
