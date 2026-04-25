// Subsequence fuzzy matcher with CJK + Latin support.
// Score signal:
//   - contiguous run of matched chars (grows quadratically with run length)
//   - match at a word/path boundary (start, after space/-/_/./\\//)
//   - earlier start position preferred
//   - shorter total match span preferred
// Indices returned are positions in the ORIGINAL text, so callers can
// pass them directly to highlight() without any post-hoc re-matching.

const BOUNDARY = /[\s\-_/.\\]/;

function eq(a, b) {
	if (a === b) return true;
	return a.toLowerCase() === b.toLowerCase();
}

function isBoundary(text, i) {
	if (i === 0) return true;
	return BOUNDARY.test(text[i - 1]);
}

/**
 * @param {string} text
 * @param {string} query
 * @returns {{ score: number, indices: number[] } | null}
 */
export function fuzzyScore(text, query) {
	if (text == null || query == null) return null;
	const n = text.length;
	const m = query.length;
	if (m === 0 || n === 0 || m > n) return null;

	let best = null;

	for (let start = 0; start <= n - m; start++) {
		if (!eq(text[start], query[0])) continue;

		const indices = [start];
		let qi = 1;
		let lastIdx = start;
		let runLen = 1;
		let score = 4;
		if (isBoundary(text, start)) score += 8;

		for (let i = start + 1; i < n && qi < m; i++) {
			if (!eq(text[i], query[qi])) continue;
			if (i === lastIdx + 1) {
				runLen++;
				score += 4 + runLen;
			} else {
				runLen = 1;
				score += 1;
				if (isBoundary(text, i)) score += 4;
			}
			indices.push(i);
			lastIdx = i;
			qi++;
		}

		if (qi < m) continue;

		const span = lastIdx - start + 1;
		score -= (span - m) * 0.5;
		score -= start * 0.05;

		if (!best || score > best.score) {
			best = { score, indices };
		}
	}

	return best;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHTML(s) {
	return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/**
 * @param {string} text
 * @param {number[] | null | undefined} indices
 * @returns {string} HTML-safe string with matched ranges wrapped in <mark class="highlight">
 */
export function highlight(text, indices) {
	if (text == null) return '';
	if (!indices || indices.length === 0) return escapeHTML(text);

	let out = '';
	let cursor = 0;
	let i = 0;
	while (i < indices.length) {
		const rangeStart = indices[i];
		let rangeEnd = rangeStart;
		while (i + 1 < indices.length && indices[i + 1] === rangeEnd + 1) {
			i++;
			rangeEnd = indices[i];
		}
		out += escapeHTML(text.slice(cursor, rangeStart));
		out += '<mark class="highlight">' + escapeHTML(text.slice(rangeStart, rangeEnd + 1)) + '</mark>';
		cursor = rangeEnd + 1;
		i++;
	}
	out += escapeHTML(text.slice(cursor));
	return out;
}
