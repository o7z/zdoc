import { existsSync } from 'node:fs';
import type { FSWatcher } from 'chokidar';

const IS_PROD = process.env.NODE_ENV === 'production';

let watchers: FSWatcher[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearAllCaches(): void {
	Promise.all([
		import('$lib/sidebar.js').then((m) => m.clearSidebarCache()),
		import('$lib/search-index.js').then((m) => m.clearSearchCache()),
		import('$lib/markdown.js').then((m) => m.clearRenderCache()),
	]).catch((err) => {
		console.warn('[zdoc watcher] Failed to clear caches:', err);
	});
}

function scheduleClear(): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		clearAllCaches();
		debounceTimer = null;
	}, 200);
}

export async function setupDocsWatcher(docsDir: string): Promise<void> {
	if (IS_PROD || !docsDir || !existsSync(docsDir)) return;

	const chokidar = await import('chokidar');
	const watcher = chokidar.watch(docsDir, {
		ignored: /(^|[\/\\])\../,
		ignoreInitial: true,
		persistent: true,
		ignorePermissionErrors: true,
	});

	const onChange = (path: string) => {
		if (!/\.(md|yaml|yml)$/.test(path)) return;
		scheduleClear();
	};

	watcher
		.on('add', (path) => {
			if (!/\.(md|yaml|yml)$/.test(path)) return;
			console.log(`[zdoc watcher] File added: ${path}`);
			scheduleClear();
		})
		.on('change', onChange)
		.on('unlink', (path) => {
			if (!/\.(md|yaml|yml)$/.test(path)) return;
			console.log(`[zdoc watcher] File removed: ${path}`);
			scheduleClear();
		})
		.on('error', (error) => {
			console.warn(`[zdoc watcher] Error watching ${docsDir}:`, error);
		});

	watchers.push(watcher);
}

export function stopDocsWatchers(): void {
	for (const watcher of watchers) {
		watcher.close();
	}
	watchers = [];
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
}
