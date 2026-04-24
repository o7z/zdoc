import { fetchLatestVersion, writeCache, getCurrentVersion, readCache } from './update.js';

async function run() {
	try {
		const latest = await fetchLatestVersion();
		const cache = readCache();
		writeCache({
			lastCheck: Date.now(),
			latest: latest ?? cache?.latest ?? null,
		});
	} catch {
		const cache = readCache();
		writeCache({
			lastCheck: Date.now(),
			latest: cache?.latest ?? null,
		});
	}
}

run();
