import { readFileSync, existsSync } from 'node:fs';

export type Lifecycle = 'draft' | 'stable' | 'archived';

export interface PageMeta {
	title?: string;
	order?: number;
	modified?: string;
	env?: string;
	visibility?: string;
	description?: string;
	author?: string;
	lifecycle?: Lifecycle;
	superseded_by?: string;
	folded_to?: string;
}

// v2-prep: children: list entries. Each entry's identity is its name (file
// stem or subdir name); other fields mirror PageMeta. See
// docs/dev/next-major.md.
export interface ChildEntry extends PageMeta {
	name: string;
}

export interface DirMeta extends PageMeta {
	pages?: Record<string, PageMeta>;
	children?: ChildEntry[];
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
			if (i === 0 || /\s/.test(s[i - 1])) {
				return s.slice(0, i).replace(/\s+$/, '');
			}
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

// Detect a list-of-mappings continuation: when a key has no inline value and
// the next line begins with '- ', the key's value is a YAML sequence whose
// items are mappings (the only list form zdoc supports — list-of-scalars is
// out of scope, see docs/dev/next-major.md "明确不做").
function isListItem(content: string): boolean {
	return content.startsWith('- ');
}

function parseListOfMappings(
	lines: Line[],
	start: number,
	baseIndent: number,
): [Array<Record<string, unknown>>, number] {
	const list: Array<Record<string, unknown>> = [];
	let i = start;
	while (i < lines.length) {
		const line = lines[i];
		if (line.indent < baseIndent) break;
		if (line.indent > baseIndent) {
			throw new Error(`Unexpected indent on line ${line.num} inside list`);
		}
		if (!isListItem(line.content)) break;

		// '- key: value' — item content begins at column (baseIndent + 2),
		// which is where the inline key sits.
		const afterDash = line.content.slice(2);
		const itemContentIndent = baseIndent + 2;
		const m = afterDash.match(KEY_VALUE_RE);
		if (!m) {
			throw new Error(`Malformed list item on line ${line.num}: ${line.content}`);
		}
		let key = m[1];
		if (key.startsWith('"') || key.startsWith("'")) key = key.slice(1, -1);
		const valueStr = m[2].trim();
		const itemObj: Record<string, unknown> = {};
		if (valueStr === '') {
			if (i + 1 < lines.length && lines[i + 1].indent > itemContentIndent) {
				const [nested, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
				itemObj[key] = nested;
				i = next;
			} else {
				itemObj[key] = null;
				i++;
			}
		} else {
			itemObj[key] = parseScalar(valueStr);
			i++;
		}

		// Continuation lines at itemContentIndent are additional keys of the
		// same item's mapping. They stop at: lower indent, or a sibling '- '.
		while (i < lines.length) {
			const nl = lines[i];
			if (nl.indent < itemContentIndent) break;
			if (nl.indent === baseIndent && isListItem(nl.content)) break;
			if (nl.indent > itemContentIndent) {
				throw new Error(`Unexpected indent on line ${nl.num} inside list item`);
			}
			const km = nl.content.match(KEY_VALUE_RE);
			if (!km) {
				throw new Error(`Malformed line ${nl.num} inside list item: ${nl.content}`);
			}
			let k = km[1];
			if (k.startsWith('"') || k.startsWith("'")) k = k.slice(1, -1);
			const v = km[2].trim();
			if (v === '') {
				if (i + 1 < lines.length && lines[i + 1].indent > itemContentIndent) {
					const [nested, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
					itemObj[k] = nested;
					i = next;
				} else {
					itemObj[k] = null;
					i++;
				}
			} else {
				itemObj[k] = parseScalar(v);
				i++;
			}
		}

		list.push(itemObj);
	}
	return [list, i];
}

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
				const nextIndent = lines[i + 1].indent;
				if (isListItem(lines[i + 1].content)) {
					const [list, next] = parseListOfMappings(lines, i + 1, nextIndent);
					obj[key] = list;
					i = next;
				} else {
					const [nested, next] = parseBlock(lines, i + 1, nextIndent);
					obj[key] = nested;
					i = next;
				}
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

const LIFECYCLE_VALUES: ReadonlySet<Lifecycle> = new Set(['draft', 'stable', 'archived']);

function coerceLifecycle(v: unknown): Lifecycle | undefined {
	return typeof v === 'string' && LIFECYCLE_VALUES.has(v as Lifecycle)
		? (v as Lifecycle)
		: undefined;
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
		if (typeof r.name !== 'string' || r.name === '') continue; // require name
		const meta = coercePageMeta(r);
		out.push({ name: r.name, ...meta });
	}
	return out;
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
		const children = coerceChildEntries(parsed.children);
		return {
			...base,
			...(pages ? { pages } : {}),
			...(children ? { children } : {}),
		};
	} catch {
		return null;
	}
}
