import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const IS_PROD = process.env.NODE_ENV === 'production';

const RELEVANT_EXTS = new Set(['.md', '.yaml', '.yml']);

interface CacheEntry<T> {
	signature: string;
	value: T;
}

// Deep-freeze cached values so accidental downstream mutation (e.g. `.push`,
// `.sort`) throws instead of silently corrupting subsequent cache hits.
function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	if (Object.isFrozen(value)) return value;
	Object.freeze(value);
	if (Array.isArray(value)) {
		for (const item of value) deepFreeze(item);
	} else {
		for (const key of Object.keys(value as Record<string, unknown>)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
	}
	return value;
}

export interface DocsCache<T> {
	get(docsDir: string, builder: () => T): T;
	clear(): void;
}

export interface AsyncDocsCache<T> {
	get(docsDir: string, builder: () => Promise<T>): Promise<T>;
	clear(): void;
}

export function computeDocsSignature(docsDir: string): string {
	if (!docsDir || !existsSync(docsDir)) return '';
	const parts: string[] = [];
	walk(docsDir, docsDir, parts);
	parts.sort();
	return parts.join('|');
}

function walk(dir: string, root: string, out: string[]): void {
	let entries: ReturnType<typeof readdirSync>;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (e.name.startsWith('.')) continue;
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			walk(full, root, out);
			continue;
		}
		if (!e.isFile()) continue;
		const dot = e.name.lastIndexOf('.');
		const ext = dot >= 0 ? e.name.slice(dot) : '';
		if (!RELEVANT_EXTS.has(ext)) continue;
		try {
			const st = statSync(full);
			const rel = relative(root, full).replace(/\\/g, '/');
			out.push(`${rel}:${st.mtimeMs}:${st.size}`);
		} catch {
			/* ignore unreadable entries */
		}
	}
}

export function createDocsCache<T>(_name: string): DocsCache<T> {
	const store = new Map<string, CacheEntry<T>>();

	return {
		get(docsDir, builder) {
			const cached = store.get(docsDir);
			if (IS_PROD && cached) return cached.value;
			const signature = IS_PROD ? '' : computeDocsSignature(docsDir);
			if (cached && cached.signature === signature) return cached.value;
			const value = deepFreeze(builder());
			store.set(docsDir, { signature, value });
			return value;
		},
		clear() {
			store.clear();
		},
	};
}

export function createAsyncDocsCache<T>(_name: string): AsyncDocsCache<T> {
	const store = new Map<string, CacheEntry<T>>();
	const inFlight = new Map<string, Promise<T>>();

	return {
		get(docsDir, builder) {
			const cached = store.get(docsDir);
			if (IS_PROD && cached) return Promise.resolve(cached.value);
			const signature = IS_PROD ? '' : computeDocsSignature(docsDir);
			if (cached && cached.signature === signature) return Promise.resolve(cached.value);

			const existing = inFlight.get(docsDir);
			if (existing) return existing;

			const promise = (async () => {
				try {
					const value = deepFreeze(await builder());
					store.set(docsDir, { signature, value });
					return value;
				} finally {
					inFlight.delete(docsDir);
				}
			})();
			inFlight.set(docsDir, promise);
			return promise;
		},
		clear() {
			store.clear();
			inFlight.clear();
		},
	};
}
