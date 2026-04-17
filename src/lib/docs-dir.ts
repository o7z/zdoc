import { getConfig } from './config.js';

export function getDocsDir(): string {
	return getConfig().docsDir;
}
