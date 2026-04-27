#!/usr/bin/env node
// zdoc mcp — stdio MCP server.
//
// Exposes the docs tree to MCP-capable AI hosts (Claude Desktop, Cursor,
// Cline, etc.) so they can list, fetch, and search docs as tool calls
// instead of fetching HTML or wrangling fetch().
//
// Tools exposed:
//   list_docs      — flat list of pages (lifecycle-filtered by default)
//   get_doc        — full markdown + metadata for one doc
//   search_docs    — substring search across titles / descriptions / content
//   get_lifecycle  — lifecycle / superseded_by / folded_to for one doc

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, sep, dirname, basename } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readDirMeta, type Lifecycle } from './meta-mini.js';

interface PageEntry {
	path: string;
	link: string;
	title: string;
	lifecycle?: Lifecycle;
	superseded_by?: string;
	folded_to?: string;
	description?: string;
	author?: string;
	modified?: string;
	parentDirTitles: string[];
	absPath: string;
}

export function walkDocs(docsDir: string): PageEntry[] {
	if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) return [];
	const out: PageEntry[] = [];
	function visit(dir: string, parentTitles: string[]) {
		const meta = readDirMeta(join(dir, '_meta.yaml'));
		if (!meta || !meta.title) return;
		const titles = [...parentTitles, meta.title];
		const pages = meta.pages ?? {};
		for (const [key, pmeta] of Object.entries(pages)) {
			if (!pmeta.title) continue;
			if (key.endsWith('.pdf')) continue;
			const target = join(dir, key + '.md');
			if (!existsSync(target) || !statSync(target).isFile()) continue;
			const rel = relative(docsDir, target).split(sep).join('/');
			out.push({
				path: rel,
				link: '/' + rel,
				title: pmeta.title,
				lifecycle: pmeta.lifecycle,
				superseded_by: pmeta.superseded_by,
				folded_to: pmeta.folded_to,
				description: pmeta.description,
				author: pmeta.author,
				modified: pmeta.modified,
				parentDirTitles: [...titles],
				absPath: target,
			});
		}
		const entries = readdirSync(dir, { withFileTypes: true }).filter(
			(e) => !e.name.startsWith('.'),
		);
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			visit(join(dir, e.name), titles);
		}
	}
	visit(docsDir, []);
	return out;
}

function safeJoin(root: string, slug: string): string | null {
	const normRoot = resolve(root);
	const resolved = resolve(normRoot, slug);
	if (resolved !== normRoot && !resolved.startsWith(normRoot + sep)) return null;
	return resolved;
}

type ToolArgs = Record<string, unknown>;

function paramString(args: ToolArgs, key: string): string | undefined {
	const v = args[key];
	return typeof v === 'string' ? v : undefined;
}

function paramBool(args: ToolArgs, key: string): boolean {
	return args[key] === true;
}

export interface SearchHit {
	path: string;
	title: string;
	section: string;
	snippet: string;
	score: number;
}

export function searchDocs(docsDir: string, query: string, limit: number): SearchHit[] {
	const q = query.toLowerCase().trim();
	if (!q) return [];
	const all = walkDocs(docsDir).filter((p) => p.lifecycle !== 'archived');
	const hits: SearchHit[] = [];
	for (const p of all) {
		let score = 0;
		let snippet = p.description ?? '';
		if (p.title.toLowerCase().includes(q)) score += 10;
		if (p.description && p.description.toLowerCase().includes(q)) score += 5;
		try {
			const raw = readFileSync(p.absPath, 'utf-8');
			const lines = raw.split(/\r?\n/);
			for (const line of lines) {
				if (line.toLowerCase().includes(q)) {
					score += 1;
					if (!snippet) snippet = line.trim();
				}
			}
		} catch {
			// ignore unreadable files
		}
		if (score > 0) {
			hits.push({
				path: p.path,
				title: p.title,
				section: p.parentDirTitles.join(' / '),
				snippet: snippet.slice(0, 200),
				score,
			});
		}
	}
	hits.sort((a, b) => b.score - a.score);
	return hits.slice(0, limit);
}

function printHelp(): void {
	process.stderr.write(`Usage: zdoc mcp [-d <docs-dir>]

Starts a stdio MCP server exposing four tools to MCP-capable AI hosts:
  list_docs       List the docs tree (lifecycle-filtered).
  get_doc         Fetch a single doc's markdown + metadata.
  search_docs     Substring search across titles / descriptions / content.
  get_lifecycle   Get lifecycle / superseded_by / folded_to for one doc.

Configure in your AI host's MCP settings, e.g. Claude Desktop:
  {
    "mcpServers": {
      "zdoc": {
        "command": "npx",
        "args": ["-y", "@o7z/zdoc", "mcp", "--dir", "./docs"]
      }
    }
  }
`);
}

export default async function runMcp(argv: string[]): Promise<number> {
	let dir = '.';
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '-h' || a === '--help') {
			printHelp();
			return 0;
		} else if (a === '-d' || a === '--dir') {
			const v = argv[++i];
			if (!v) {
				process.stderr.write(`Error: missing value for ${a}\n`);
				return 1;
			}
			dir = v;
		} else {
			process.stderr.write(`Error: unknown mcp argument: ${a}\n`);
			printHelp();
			return 1;
		}
	}

	const docsDir = resolve(process.cwd(), dir);
	if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
		process.stderr.write(`Error: docs directory not found: ${docsDir}\n`);
		return 1;
	}

	const server = new Server(
		{ name: 'zdoc', version: '1.0.0' },
		{ capabilities: { tools: {} } },
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			{
				name: 'list_docs',
				description:
					'List all docs in the zdoc tree. Returns title, path, section breadcrumb, and lifecycle metadata. Excludes archived pages by default.',
				inputSchema: {
					type: 'object',
					properties: {
						lifecycle: {
							type: 'string',
							enum: ['draft', 'stable', 'archived'],
							description: 'Filter to a specific lifecycle stage.',
						},
						include_archived: {
							type: 'boolean',
							description: 'Include archived pages in the result (default: false).',
						},
					},
				},
			},
			{
				name: 'get_doc',
				description:
					'Fetch full markdown content + metadata for a single doc, given its path relative to docsDir.',
				inputSchema: {
					type: 'object',
					properties: {
						path: {
							type: 'string',
							description: 'Doc path relative to docsDir, e.g. "guide/intro/install.md".',
						},
					},
					required: ['path'],
				},
			},
			{
				name: 'search_docs',
				description:
					'Substring search across doc titles, descriptions, and content. Returns ranked matches. Excludes archived pages.',
				inputSchema: {
					type: 'object',
					properties: {
						query: { type: 'string', description: 'Search query (case-insensitive substring).' },
						limit: { type: 'number', description: 'Max results to return (default: 20).' },
					},
					required: ['query'],
				},
			},
			{
				name: 'get_lifecycle',
				description:
					'Get lifecycle metadata (lifecycle, superseded_by, folded_to) for a single doc. Useful for checking whether a doc is canonical or has been superseded.',
				inputSchema: {
					type: 'object',
					properties: {
						path: { type: 'string', description: 'Doc path relative to docsDir.' },
					},
					required: ['path'],
				},
			},
		],
	}));

	server.setRequestHandler(CallToolRequestSchema, async (req) => {
		const { name, arguments: rawArgs = {} } = req.params;
		const a = rawArgs as ToolArgs;
		try {
			if (name === 'list_docs') {
				const lifecycle = paramString(a, 'lifecycle') as Lifecycle | undefined;
				const includeArchived = paramBool(a, 'include_archived');
				const all = walkDocs(docsDir);
				const filtered = all.filter((p) => {
					if (!includeArchived && p.lifecycle === 'archived') return false;
					if (lifecycle && p.lifecycle !== lifecycle) return false;
					return true;
				});
				const projected = filtered.map((p) => ({
					path: p.path,
					link: p.link,
					title: p.title,
					section: p.parentDirTitles.join(' / '),
					...(p.lifecycle && { lifecycle: p.lifecycle }),
					...(p.superseded_by && { superseded_by: p.superseded_by }),
					...(p.folded_to && { folded_to: p.folded_to }),
					...(p.description && { description: p.description }),
				}));
				return { content: [{ type: 'text', text: JSON.stringify(projected, null, 2) }] };
			}

			if (name === 'get_doc') {
				const path = paramString(a, 'path');
				if (!path) throw new Error('path is required');
				const abs = safeJoin(docsDir, path);
				if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
					throw new Error(`File not found: ${path}`);
				}
				const key = basename(abs).replace(/\.md$/, '');
				const parentMeta = readDirMeta(join(dirname(abs), '_meta.yaml'));
				const pageMeta = parentMeta?.pages?.[key];
				if (!pageMeta || !pageMeta.title) {
					throw new Error(`Page not registered in _meta.yaml: ${path}`);
				}
				const raw = readFileSync(abs, 'utf-8').replace(/^---\n[\s\S]*?\n---\n/, '');
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									path,
									title: pageMeta.title,
									lifecycle: pageMeta.lifecycle ?? null,
									superseded_by: pageMeta.superseded_by ?? null,
									folded_to: pageMeta.folded_to ?? null,
									description: pageMeta.description ?? null,
									author: pageMeta.author ?? null,
									modified: pageMeta.modified ?? null,
									markdown: raw,
								},
								null,
								2,
							),
						},
					],
				};
			}

			if (name === 'search_docs') {
				const query = paramString(a, 'query');
				if (!query) throw new Error('query is required');
				const limit = typeof a.limit === 'number' && a.limit > 0 ? Math.floor(a.limit) : 20;
				const hits = searchDocs(docsDir, query, limit);
				return { content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }] };
			}

			if (name === 'get_lifecycle') {
				const path = paramString(a, 'path');
				if (!path) throw new Error('path is required');
				const abs = safeJoin(docsDir, path);
				if (!abs) throw new Error(`Invalid path: ${path}`);
				const key = basename(abs).replace(/\.md$/, '');
				const parentMeta = readDirMeta(join(dirname(abs), '_meta.yaml'));
				const pageMeta = parentMeta?.pages?.[key];
				if (!pageMeta) throw new Error(`Page not registered in _meta.yaml: ${path}`);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									path,
									title: pageMeta.title ?? null,
									lifecycle: pageMeta.lifecycle ?? 'unspecified',
									superseded_by: pageMeta.superseded_by ?? null,
									folded_to: pageMeta.folded_to ?? null,
								},
								null,
								2,
							),
						},
					],
				};
			}

			throw new Error(`Unknown tool: ${name}`);
		} catch (err) {
			return {
				content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
				isError: true,
			};
		}
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
	// Server runs until the transport closes (peer disconnects). The promise
	// below intentionally never resolves; Node exits when stdin closes.
	return new Promise(() => {});
}

const __thisFile = import.meta.url;
const __invokedAs = process.argv[1] ? `file://${process.argv[1].replace(/\\/g, '/')}` : '';
if (__thisFile === __invokedAs || __invokedAs.endsWith('/bin/mcp.js')) {
	runMcp(process.argv.slice(2)).then((code) => process.exit(code));
}
