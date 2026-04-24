import { readFileSync, existsSync } from 'node:fs';

export interface PageMeta {
	title?: string;
	order?: number;
	modified?: string;
	env?: string;
	description?: string;
	version?: string;
	author?: string;
}

export interface DirMeta extends PageMeta {
	pages?: Record<string, PageMeta>;
}

interface Line {
	num: number;
	indent: number;
	content: string;
}

function stripComment(s: string): string {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '\\' && (inSingle || inDouble)) {
			i++;
			continue;
		}
		if (!inDouble && c === "'") inSingle = !inSingle;
		else if (!inSingle && c === '"') inDouble = !inDouble;
		else if (!inSingle && !inDouble && c === '#') {
			return s.slice(0, i).replace(/\s+$/, '');
		}
	}
	return s.replace(/\s+$/, '');
}

function parseScalar(s: string): unknown {
	if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
		return s
			.slice(1, -1)
			.replace(/\\"/g, '"')
			.replace(/\\n/g, '\n')
			.replace(/\\t/g, '\t')
			.replace(/\\\\/g, '\\');
	}
	if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
		return s.slice(1, -1).replace(/''/g, "'");
	}
	if (s === 'true') return true;
	if (s === 'false') return false;
	if (s === 'null' || s === '~' || s === '') return null;
	if (/^-?\d+$/.test(s)) return parseInt(s, 10);
	if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
	return s;
}

const KEY_VALUE_RE = /^([A-Za-z0-9_][A-Za-z0-9_\-.]*|"[^"]*"|'[^']*'):\s*(.*)$/;

function parseBlock(
	lines: Line[],
	start: number,
	baseIndent: number,
): [Record<string, unknown>, number] {
	const obj: Record<string, unknown> = {};
	let i = start;

	while (i < lines.length) {
		const line = lines[i];
		if (line.indent < baseIndent) break;
		if (line.indent > baseIndent) {
			throw new Error(
				`Unexpected indent on line ${line.num}: expected ${baseIndent}, got ${line.indent}`,
			);
		}

		const m = line.content.match(KEY_VALUE_RE);
		if (!m) {
			throw new Error(`Malformed line ${line.num}: ${line.content}`);
		}

		let key = m[1];
		if (key.startsWith('"') || key.startsWith("'")) key = key.slice(1, -1);

		const valueStr = m[2].trim();

		if (valueStr === '') {
			if (i + 1 < lines.length && lines[i + 1].indent > baseIndent) {
				const [nested, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
				obj[key] = nested;
				i = next;
			} else {
				obj[key] = null;
				i++;
			}
		} else {
			obj[key] = parseScalar(valueStr);
			i++;
		}
	}

	return [obj, i];
}

export function parseYaml(input: string): Record<string, unknown> {
	const raw = input.split(/\r?\n/);
	const lines: Line[] = [];

	for (let i = 0; i < raw.length; i++) {
		const src = raw[i];
		const m = src.match(/^( *)(.*)$/)!;
		const indent = m[1].length;
		const content = stripComment(m[2]);
		if (!content) continue;
		lines.push({ num: i + 1, indent, content });
	}

	if (lines.length === 0) return {};
	if (lines[0].indent !== 0) {
		throw new Error(`Root line must start at column 0 (line ${lines[0].num})`);
	}

	const [result] = parseBlock(lines, 0, 0);
	return result;
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
		description: typeof r.description === 'string' ? r.description : undefined,
		version: typeof r.version === 'string' ? r.version : undefined,
		author: typeof r.author === 'string' ? r.author : undefined,
	};
}

export function readDirMeta(metaYamlPath: string): DirMeta | null {
	if (!existsSync(metaYamlPath)) return null;
	try {
		const parsed = parseYaml(readFileSync(metaYamlPath, 'utf-8'));
		const base = coercePageMeta(parsed);
		const pagesRaw = parsed.pages;
		let pages: Record<string, PageMeta> | undefined;
		if (pagesRaw && typeof pagesRaw === 'object') {
			pages = {};
			for (const [k, v] of Object.entries(pagesRaw)) {
				pages[k] = coercePageMeta(v);
			}
		}
		return { ...base, ...(pages ? { pages } : {}) };
	} catch {
		return null;
	}
}
