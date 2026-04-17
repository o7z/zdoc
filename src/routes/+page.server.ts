import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderMarkdown } from '$lib/markdown.js';
import { getDocsDir } from '$lib/docs-dir.js';
import { extractMeta, hasBody, stripMetaComments } from '$lib/meta.js';
import type { PageServerLoad } from './$types';

interface HeroAction {
	theme: string;
	text: string;
	link: string;
}

interface HeroFeature {
	title: string;
	details: string;
}

interface Hero {
	name: string;
	text: string;
	tagline: string;
	features: HeroFeature[];
	actions: HeroAction[];
}

export const load: PageServerLoad = async () => {
	const docsDir = getDocsDir();

	const metaPath = join(docsDir, '_meta.md');
	if (existsSync(metaPath)) {
		const raw = readFileSync(metaPath, 'utf-8');
		if (hasBody(raw)) {
			const meta = extractMeta(raw);
			const html = await renderMarkdown(stripMetaComments(raw));
			return { title: meta.title ?? 'Docs', html, hero: null };
		}
	}

	const indexPath = join(docsDir, 'index.md');
	if (!existsSync(indexPath)) {
		return {
			title: 'Docs',
			html: '<h1>Welcome</h1><p>No index.md or _meta.md body found in docs directory.</p>',
			hero: null,
		};
	}

	const raw = readFileSync(indexPath, 'utf-8');

	const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
	const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

	let hero: Hero | null = null;
	if (fmMatch) {
		const fm = fmMatch[1];
		const nameMatch = fm.match(/name:\s*(.+)/);
		const textMatch = fm.match(/text:\s*(.+)/);
		const taglineMatch = fm.match(/tagline:\s*(.+)/);

		const features: HeroFeature[] = [];
		for (const m of fm.matchAll(/-\s+title:\s*(.+)\n\s+details:\s*(.+)/g)) {
			features.push({ title: m[1].trim(), details: m[2].trim() });
		}

		const actions: HeroAction[] = [];
		for (const m of fm.matchAll(/-\s+theme:\s*(\w+)\s*\n\s+text:\s*(.+)\n\s+link:\s*(.+)/g)) {
			actions.push({ theme: m[1].trim(), text: m[2].trim(), link: m[3].trim() });
		}

		if (nameMatch || textMatch) {
			hero = {
				name: nameMatch?.[1]?.trim() || '',
				text: textMatch?.[1]?.trim() || '',
				tagline: taglineMatch?.[1]?.trim() || '',
				features,
				actions,
			};
		}
	}

	const html = body ? await renderMarkdown(body) : '';
	const title = hero?.name || 'Docs';

	return { title, html, hero };
};
