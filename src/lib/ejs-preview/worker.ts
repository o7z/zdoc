// Web Worker that compiles and executes EJS templates in isolation.
// Lives in the worker thread; the main thread talks to it via postMessage
// (see sandbox.ts). Isolation buys two things: (1) infinite loops in a
// template can be killed by terminating the worker, and (2) EJS's reliance
// on `new Function` doesn't touch the host page's globals.

import ejsModule from 'ejs';

const ejs = (ejsModule as unknown as { default?: { render: typeof renderFn }; render?: typeof renderFn }).default ?? (ejsModule as unknown as { render: typeof renderFn });

declare function renderFn(template: string, data: Record<string, unknown>, opts?: Record<string, unknown>): string;

interface RenderRequest {
	id: number;
	template: string;
	data: Record<string, unknown>;
}

self.addEventListener('message', (e: MessageEvent<RenderRequest>) => {
	const { id, template, data } = e.data;
	try {
		const output = ejs.render(template, data ?? {});
		(self as unknown as { postMessage: (msg: unknown) => void }).postMessage({ id, ok: true, output });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		(self as unknown as { postMessage: (msg: unknown) => void }).postMessage({ id, ok: false, error: msg });
	}
});

// Export {} so Vite treats this file as a module (required for `?worker`).
export {};
