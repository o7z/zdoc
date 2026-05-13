// Form-data helpers paired with extract.ts.
//
// defaultDataForShape: builds an initial JS value from a Shape tree, used to
// seed the form when a preview block first mounts. Arrays start with one
// element so the preview shows a populated state immediately.
//
// getPath / setPath: address into the data tree using a path of string keys
// and numeric indices, returning an immutably-updated copy. FormField uses
// setPath to apply user edits.

import type { Shape } from './extract.js';

export type PathSegment = string | number;

export function defaultDataForShape(shape: Shape): unknown {
	switch (shape.kind) {
		case 'string':
			return '';
		case 'boolean':
			return false;
		case 'number':
			return 0;
		case 'array':
			return [defaultDataForShape(shape.element)];
		case 'object': {
			const out: Record<string, unknown> = {};
			for (const [key, sub] of Object.entries(shape.properties)) {
				out[key] = defaultDataForShape(sub);
			}
			return out;
		}
	}
}

export function getPath(data: unknown, path: PathSegment[]): unknown {
	let cur: unknown = data;
	for (const seg of path) {
		if (cur == null) return undefined;
		if (typeof seg === 'number') {
			if (!Array.isArray(cur)) return undefined;
			cur = cur[seg];
		} else {
			if (typeof cur !== 'object') return undefined;
			cur = (cur as Record<string, unknown>)[seg];
		}
	}
	return cur;
}

// Returns a new data tree with the leaf at `path` replaced by `value`.
// Intermediate objects/arrays along the path are shallow-cloned so the
// original tree is untouched (Svelte reactivity friendly).
export function setPath(data: unknown, path: PathSegment[], value: unknown): unknown {
	if (path.length === 0) return value;
	const [head, ...rest] = path;
	if (typeof head === 'number') {
		const arr = Array.isArray(data) ? data.slice() : [];
		arr[head] = setPath(arr[head], rest, value);
		return arr;
	}
	const obj: Record<string, unknown> = (data && typeof data === 'object' && !Array.isArray(data))
		? { ...(data as Record<string, unknown>) }
		: {};
	obj[head] = setPath(obj[head], rest, value);
	return obj;
}

// Append a new element to the array at `path`, defaulted from `elementShape`.
// Returns the updated tree.
export function appendArrayItem(data: unknown, path: PathSegment[], elementShape: Shape): unknown {
	const arr = getPath(data, path);
	const next = Array.isArray(arr) ? arr.slice() : [];
	next.push(defaultDataForShape(elementShape));
	return setPath(data, path, next);
}

// Remove the array item at `path` (where the last segment is the index).
export function removeArrayItem(data: unknown, path: PathSegment[]): unknown {
	if (path.length === 0) return data;
	const idx = path[path.length - 1];
	if (typeof idx !== 'number') return data;
	const parentPath = path.slice(0, -1);
	const arr = getPath(data, parentPath);
	if (!Array.isArray(arr)) return data;
	const next = arr.slice();
	next.splice(idx, 1);
	return setPath(data, parentPath, next);
}

// Move an array item from `fromIdx` to `toIdx` within the array at `parentPath`.
export function moveArrayItem(data: unknown, parentPath: PathSegment[], fromIdx: number, toIdx: number): unknown {
	const arr = getPath(data, parentPath);
	if (!Array.isArray(arr)) return data;
	if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return data;
	if (fromIdx === toIdx) return data;
	const next = arr.slice();
	const [item] = next.splice(fromIdx, 1);
	next.splice(toIdx, 0, item);
	return setPath(data, parentPath, next);
}
