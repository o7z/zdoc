#!/usr/bin/env node
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

process.env.ZDOC_DIR = join(repoRoot, 'docs');
process.env.ZDOC_TITLE = process.env.ZDOC_TITLE ?? 'zdoc';

process.chdir(repoRoot);

const { createServer } = await import('vite');
const server = await createServer();
await server.listen();
server.printUrls();
