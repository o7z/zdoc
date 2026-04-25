#!/usr/bin/env node
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

process.env.ZDOC_DIR = join(repoRoot, 'demo');
process.env.ZDOC_TITLE = process.env.ZDOC_TITLE ?? 'zdoc demo';

process.chdir(repoRoot);

const { createServer } = await import('vite');
const server = await createServer({
	server: { port: Number(process.env.VITE_PORT || 20000) },
});
await server.listen();
server.printUrls();
