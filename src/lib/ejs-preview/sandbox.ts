// Main-thread wrapper around the EJS worker. Spawns a single long-lived
// worker, routes requests by id, and enforces a 1-second wall-clock timeout
// per render. On timeout the worker is terminated and respawned for the
// next request — protecting the page from runaway templates.

import EjsWorker from './worker.ts?worker';

export interface RenderResult {
	ok: boolean;
	output?: string;
	error?: string;
}

const DEFAULT_TIMEOUT_MS = 1000;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: RenderResult) => void; timer: ReturnType<typeof setTimeout> }>();

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new EjsWorker();
	w.addEventListener('message', (e: MessageEvent<{ id: number; ok: boolean; output?: string; error?: string }>) => {
		const { id, ok, output, error } = e.data;
		const entry = pending.get(id);
		if (!entry) return;
		clearTimeout(entry.timer);
		pending.delete(id);
		entry.resolve({ ok, output, error });
	});
	w.addEventListener('error', (e) => {
		// Generic worker error — fail all pending requests.
		for (const [id, entry] of pending) {
			clearTimeout(entry.timer);
			entry.resolve({ ok: false, error: e.message || 'worker error' });
			pending.delete(id);
		}
	});
	worker = w;
	return w;
}

export function renderInWorker(
	template: string,
	data: Record<string, unknown>,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<RenderResult> {
	return new Promise((resolve) => {
		const id = nextId++;
		const w = ensureWorker();
		const timer = setTimeout(() => {
			pending.delete(id);
			// Kill the worker — the template may still be executing.
			try {
				w.terminate();
			} catch {
				/* ignore */
			}
			worker = null;
			// Fail any other pending requests too; they'll be retried by the caller
			// on a fresh worker.
			for (const [otherId, entry] of pending) {
				clearTimeout(entry.timer);
				entry.resolve({ ok: false, error: 'worker terminated' });
				pending.delete(otherId);
			}
			resolve({ ok: false, error: `执行超时 (>${timeoutMs}ms)` });
		}, timeoutMs);
		pending.set(id, { resolve, timer });
		w.postMessage({ id, template, data });
	});
}
