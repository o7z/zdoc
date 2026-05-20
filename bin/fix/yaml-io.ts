// zdoc fix — _meta.yaml read/write helpers.
//
// readDirMetaWithSha: parse a _meta.yaml file AND return the raw source +
// its sha256 digest, so engine.apply() can verify the file hasn't changed
// on disk between scan and write phases (optimistic concurrency).
//
// dumpDirMeta: deterministic YAML emitter for _meta.yaml. Reserved for
// US-002 — this story exports the symbol but throws if called so callers
// fail loud rather than silently dropping data.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readDirMeta, parseYaml } from '../meta-mini.js';
import type { DirMeta, PageMeta, ChildEntry, Lifecycle } from './types.js';

export interface DirMetaReadResult {
	meta: DirMeta | null;   // null when parse failed (mirrors readDirMeta)
	sha: string;            // sha256 hex of the raw source bytes
	source: string;         // raw file contents, utf-8
}

export function sha256Hex(source: string): string {
	return createHash('sha256').update(source, 'utf-8').digest('hex');
}

export function readDirMetaWithSha(metaPath: string): DirMetaReadResult | null {
	if (!existsSync(metaPath)) return null;
	const source = readFileSync(metaPath, 'utf-8');
	const sha = sha256Hex(source);
	const meta = readDirMeta(metaPath);
	return { meta, sha, source };
}

// Parse a _meta.yaml source STRING (not a path) into a DirMeta.
// Used by recipe.apply() to mutate the current source then re-dump.
// Returns null on parse failure.

const LIFECYCLE_VALUES: ReadonlySet<Lifecycle> = new Set(['draft', 'stable', 'archived']);

function coerceLifecycle(v: unknown): Lifecycle | undefined {
	return typeof v === 'string' && LIFECYCLE_VALUES.has(v as Lifecycle) ? (v as Lifecycle) : undefined;
}

function coercePageMeta(raw: unknown): PageMeta {
	if (!raw || typeof raw !== 'object') return {};
	const r = raw as Record<string, unknown>;
	const order =
		typeof r.order === 'number'
			? r.order
			: typeof r.order === 'string'
				? Number(r.order)
				: undefined;
	return {
		title: typeof r.title === 'string' ? r.title : undefined,
		order: Number.isFinite(order) ? (order as number) : undefined,
		modified: typeof r.modified === 'string' ? r.modified : undefined,
		env: typeof r.env === 'string' ? r.env : undefined,
		visibility: typeof r.visibility === 'string' ? r.visibility : undefined,
		description: typeof r.description === 'string' ? r.description : undefined,
		author: typeof r.author === 'string' ? r.author : undefined,
		lifecycle: coerceLifecycle(r.lifecycle),
		superseded_by: typeof r.superseded_by === 'string' ? r.superseded_by : undefined,
		folded_to: typeof r.folded_to === 'string' ? r.folded_to : undefined,
	};
}

function coerceChildEntries(raw: unknown): ChildEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const out: ChildEntry[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const r = item as Record<string, unknown>;
		if (typeof r.name !== 'string' || r.name === '') continue;
		const meta = coercePageMeta(r);
		out.push({ name: r.name, ...meta });
	}
	return out;
}

export function parseDirMetaFromString(source: string): DirMeta | null {
	try {
		const parsed = parseYaml(source);
		const base = coercePageMeta(parsed);
		const out: DirMeta = {
			title: base.title,
			order: base.order,
			env: base.env,
			visibility: base.visibility,
		};
		const pagesRaw = parsed.pages;
		if (pagesRaw && typeof pagesRaw === 'object') {
			const pages: Record<string, PageMeta> = {};
			for (const [k, v] of Object.entries(pagesRaw as Record<string, unknown>)) {
				pages[k] = coercePageMeta(v);
			}
			out.pages = pages;
		}
		const children = coerceChildEntries(parsed.children);
		if (children) out.children = children;
		return out;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Deterministic _meta.yaml emitter  (US-002)
// ---------------------------------------------------------------------------
//
// Rules:
//   • 2-space indent, LF line endings, ends with a single '\n'
//   • Top-level field order: title, order, env, description, author,
//     modified, lifecycle, superseded_by, folded_to, pages
//   • Per-page field order: title, order, env, description, author,
//     modified, lifecycle, superseded_by, folded_to
//   • Missing fields are omitted (not null/empty)
//   • Empty pages map → omit 'pages' key entirely
//   • String quoting: quote with double-quotes when value contains
//     ': ' (colon+space), starts with '#', has leading/trailing
//     whitespace, starts with a YAML special char, or equals a
//     YAML boolean/null literal or looks like a number.

/** Characters that, when at the start of a value, require quoting. */
const YAML_SPECIAL_STARTS = new Set([
	'-', '?', '[', '{', '|', '>', '!', '&', '*', '@', '`', ',', "'", '"',
]);

/** YAML boolean/null literals that must be quoted when used as strings. */
const YAML_RESERVED = new Set(['true', 'false', 'null', '~']);

function needsQuoting(s: string): boolean {
	if (s.length === 0) return true;
	// Leading/trailing whitespace
	if (s !== s.trim()) return true;
	// Starts with a YAML special character
	if (YAML_SPECIAL_STARTS.has(s[0])) return true;
	// Contains ': ' (key-value separator in flow style)
	if (s.includes(': ')) return true;
	// Ends with ':'
	if (s.endsWith(':')) return true;
	// Contains double-quote or backslash (would need escaping inside a double-quoted scalar)
	if (s.includes('"') || s.includes('\\')) return true;
	// Starts with '#'  (comment marker)
	if (s.startsWith('#')) return true;
	// YAML reserved literals
	if (YAML_RESERVED.has(s)) return true;
	// Looks like an integer or float
	if (/^-?\d+(\.\d+)?$/.test(s)) return true;
	return false;
}

function quoteString(s: string): string {
	if (!needsQuoting(s)) return s;
	// Double-quote with escaping of backslash and double-quote
	const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `"${escaped}"`;
}

/** Field order for both dir-level and page-level entries. */
const FIELD_ORDER: ReadonlyArray<string> = [
	'title', 'order', 'env', 'visibility', 'description', 'author',
	'modified', 'lifecycle', 'superseded_by', 'folded_to',
];

/** Field order inside a children: list item. Same as FIELD_ORDER but
 * 'name' is the inline (first) key (emitted via '- name: ...'). */
const CHILD_FIELD_ORDER: ReadonlyArray<string> = FIELD_ORDER;

function emitPageFields(obj: Record<string, unknown>, indent: string): string {
	let out = '';
	for (const field of FIELD_ORDER) {
		const val = obj[field];
		if (val === undefined || val === null) continue;
		if (typeof val === 'number') {
			out += `${indent}${field}: ${val}\n`;
		} else if (typeof val === 'string') {
			out += `${indent}${field}: ${quoteString(val)}\n`;
		} else if (typeof val === 'boolean') {
			// lifecycle values are strings; booleans shouldn't appear but handle gracefully
			out += `${indent}${field}: ${val}\n`;
		}
	}
	return out;
}

export function dumpDirMeta(meta: DirMeta): string {
	let out = '';

	// Top-level scalar fields (same order as FIELD_ORDER, minus 'pages'/'children')
	const topLevel = meta as unknown as Record<string, unknown>;
	out += emitPageFields(topLevel, '');

	// pages block
	const pages = meta.pages;
	if (pages && typeof pages === 'object') {
		const entries = Object.entries(pages);
		if (entries.length > 0) {
			out += 'pages:\n';
			for (const [slug, pageMeta] of entries) {
				out += `  ${quoteString(slug)}:\n`;
				const pageFields = (pageMeta ?? {}) as unknown as Record<string, unknown>;
				const body = emitPageFields(pageFields, '    ');
				if (body) {
					out += body;
				}
			}
		}
	}

	// children block (v2 schema)
	const children = meta.children;
	if (Array.isArray(children) && children.length > 0) {
		out += 'children:\n';
		for (const child of children) {
			const c = child as unknown as Record<string, unknown>;
			const name = typeof c.name === 'string' ? c.name : '';
			// '- name: <name>' inline first key (CHILD_FIELD_ORDER excludes 'name')
			out += `  - name: ${quoteString(name)}\n`;
			// Remaining fields at 4-space indent
			for (const field of CHILD_FIELD_ORDER) {
				if (field === 'name') continue;
				const val = c[field];
				if (val === undefined || val === null) continue;
				if (typeof val === 'number') {
					out += `    ${field}: ${val}\n`;
				} else if (typeof val === 'string') {
					out += `    ${field}: ${quoteString(val)}\n`;
				} else if (typeof val === 'boolean') {
					out += `    ${field}: ${val}\n`;
				}
			}
		}
	}

	// Guarantee output ends with exactly one '\n'
	if (out === '') return '\n';
	if (!out.endsWith('\n')) out += '\n';
	return out;
}
