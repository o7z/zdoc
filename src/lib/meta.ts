export interface DocMeta {
	title?: string;
	order?: number;
	modified?: string;
	env?: string;
}

/**
 * Minimal YAML flow-mapping parser for `{key: value, key2: value2}`.
 * Supports unquoted/"quoted"/'quoted' strings, integers, floats, booleans, null.
 * Arrays/nested objects are not supported — our metadata is flat.
 */
export function parseZdocFlow(input: string): Record<string, unknown> {
	const s = input.trim();
	if (!s.startsWith('{') || !s.endsWith('}')) {
		throw new Error('Expected flow mapping {...}');
	}
	const body = s.slice(1, -1);
	const result: Record<string, unknown> = {};
	let i = 0;

	const skipWs = () => {
		while (i < body.length && /\s/.test(body[i])) i++;
	};

	const readQuoted = (quote: string): string => {
		const start = ++i;
		let out = '';
		while (i < body.length) {
			if (body[i] === '\\' && i + 1 < body.length) {
				out += body[i + 1];
				i += 2;
				continue;
			}
			if (body[i] === quote) {
				i++;
				return out;
			}
			out += body[i++];
		}
		throw new Error(`Unterminated string starting at ${start}`);
	};

	const readUnquotedKey = (): string => {
		const start = i;
		while (i < body.length && body[i] !== ':' && !/[\s,}]/.test(body[i])) i++;
		return body.slice(start, i);
	};

	const readUnquotedValue = (): string => {
		const start = i;
		while (i < body.length && body[i] !== ',') i++;
		return body.slice(start, i).trim();
	};

	const coerce = (raw: string): unknown => {
		if (raw === 'true') return true;
		if (raw === 'false') return false;
		if (raw === 'null' || raw === '~' || raw === '') return null;
		if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
		if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
		return raw;
	};

	while (i < body.length) {
		skipWs();
		if (i >= body.length) break;

		let key: string;
		if (body[i] === '"' || body[i] === "'") {
			key = readQuoted(body[i]);
		} else {
			key = readUnquotedKey();
		}
		if (!key) throw new Error(`Empty key at position ${i}`);

		skipWs();
		if (body[i] !== ':') throw new Error(`Expected ':' after key '${key}' at ${i}`);
		i++;
		skipWs();

		let value: unknown;
		if (i < body.length && (body[i] === '"' || body[i] === "'")) {
			value = readQuoted(body[i]);
		} else {
			value = coerce(readUnquotedValue());
		}

		result[key] = value;

		skipWs();
		if (i < body.length) {
			if (body[i] === ',') {
				i++;
			} else {
				throw new Error(`Unexpected char '${body[i]}' at ${i}`);
			}
		}
	}

	return result;
}

const ZDOC_COMMENT_RE = /<!--\s*zdoc\s*:\s*(\{[\s\S]*?\})\s*-->/;
const LEGACY_COMMENT_RE = /<!--\s*(\w+)\s*:\s*(.+?)\s*-->/g;

function normalize(obj: Record<string, unknown>): DocMeta {
	const rawOrder = obj.order;
	let order: number | undefined;
	if (typeof rawOrder === 'number' && Number.isFinite(rawOrder)) {
		order = rawOrder;
	} else if (typeof rawOrder === 'string') {
		const n = parseInt(rawOrder, 10);
		if (Number.isFinite(n)) order = n;
	}

	return {
		title: typeof obj.title === 'string' ? obj.title : undefined,
		order,
		modified: typeof obj.modified === 'string' ? obj.modified : undefined,
		env: typeof obj.env === 'string' ? obj.env : undefined,
	};
}

/** Extract DocMeta from file contents. zdoc: notation wins over legacy per-key comments. */
export function extractMeta(content: string): DocMeta {
	const m = content.match(ZDOC_COMMENT_RE);
	if (m) {
		try {
			return normalize(parseZdocFlow(m[1]));
		} catch {
			/* fall through to legacy parsing */
		}
	}

	const legacy: Record<string, string> = {};
	let match: RegExpExecArray | null;
	const re = new RegExp(LEGACY_COMMENT_RE.source, LEGACY_COMMENT_RE.flags);
	while ((match = re.exec(content)) !== null) {
		if (match[1] === 'zdoc') continue;
		legacy[match[1]] = match[2].trim();
	}
	return normalize(legacy);
}

/** Strip all zdoc/legacy metadata comments so the remainder can render cleanly. */
export function stripMetaComments(content: string): string {
	return content
		.replace(/<!--\s*zdoc\s*:\s*\{[\s\S]*?\}\s*-->\s*\n?/g, '')
		.replace(/<!--\s*\w+\s*:\s*.+?\s*-->\s*\n?/g, '');
}

/** True if the file has meaningful Markdown body beyond metadata comments. */
export function hasBody(content: string): boolean {
	return stripMetaComments(content).trim().length > 0;
}
