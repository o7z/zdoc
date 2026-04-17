import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDocsDir } from '$lib/docs-dir.js';

export const GET: RequestHandler = ({ params }) => {
	const docsDir = getDocsDir();
	const slug = params.path || '';

	if (!/\.pdf$/i.test(slug)) {
		error(404, 'Not a PDF');
	}

	const normRoot = resolve(docsDir);
	const filePath = resolve(normRoot, slug);
	if (filePath !== normRoot && !filePath.startsWith(normRoot + sep)) {
		error(403, 'Forbidden');
	}
	if (!existsSync(filePath) || !statSync(filePath).isFile()) {
		error(404, 'PDF not found');
	}

	const bytes = readFileSync(filePath);
	const body = new Uint8Array(bytes);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Length': String(bytes.byteLength),
			'Cache-Control': 'private, max-age=0',
			'Content-Disposition': 'inline',
		},
	});
};
