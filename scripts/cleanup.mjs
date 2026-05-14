#!/usr/bin/env node
// Deprecate all npm versions before the latest, and delete old git tags.
//
// Usage:
//   node scripts/cleanup         # uses latest published version as retain point
//   node scripts/cleanup 1.15.6  # explicit retain version
//
// What it does:
//   1. `npm deprecate` all versions < retain (npm doesn't allow unpublish after 72h)
//   2. `git tag -d` + `git push --delete` for all local/remote tags < retain

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pkgPath = join(repoRoot, 'package.json');

function run(cmd, opts) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { stdio: 'pipe', ...opts });
	} catch (err) {
		console.error(`  ✗ ${cmd}`);
		console.error(`  ${err.stderr?.toString().trim() || err.message}`);
		return null;
	}
}

function capture(cmd) {
	return execSync(cmd, { encoding: 'utf-8' }).trim();
}

// ── resolve retain version ──
const explicit = process.argv[2]?.trim();
let retain;
if (explicit) {
	retain = explicit;
} else {
	const out = capture('npm view @o7z/zdoc version 2>/dev/null');
	retain = out.trim();
}
if (!retain) {
	console.error('Could not determine latest version.');
	process.exit(1);
}
console.log(`\nRetain version: v${retain}\n`);

// ── compare semver ──
function semverParts(v) {
	return v.replace(/^v?/, '').split('.').map(Number);
}
function lt(a, b) {
	const [a1, a2, a3] = semverParts(a);
	const [b1, b2, b3] = semverParts(b);
	if (a1 !== b1) return a1 < b1;
	if (a2 !== b2) return a2 < b2;
	return a3 < b3;
}

// ═══════════════════════════════════════
// 1. Deprecate old npm versions
// ═══════════════════════════════════════
console.log('─'.repeat(40));
console.log('Deprecating npm versions…');
console.log('─'.repeat(40));

const versionsJson = capture('npm view @o7z/zdoc versions --json');
const versions = JSON.parse(versionsJson);
const toDeprecate = versions.filter((v) => lt(v, retain));

if (toDeprecate.length === 0) {
	console.log('  (nothing to deprecate)');
} else {
	for (const v of toDeprecate) {
		const msg = `deprecated — use @${retain} instead`;
		run(`npm deprecate @o7z/zdoc@${v} "${msg}"`);
	}
}

// ═══════════════════════════════════════
// 2. Delete old git tags
// ═══════════════════════════════════════
console.log('');
console.log('─'.repeat(40));
console.log('Deleting old git tags…');
console.log('─'.repeat(40));

const tags = capture('git tag -l --sort=-v:refname').split('\n').filter(Boolean);
const toDelete = tags.filter((t) => {
	const v = t.replace(/^v/, '');
	return lt(v, retain);
});

if (toDelete.length === 0) {
	console.log('  (nothing to delete)');
} else {
	// delete remote first
	for (const tag of toDelete) {
		run(`git push origin --delete ${tag}`);
	}
	// then local
	for (const tag of toDelete) {
		run(`git tag -d ${tag}`);
	}
}

console.log(`\n✔ Done. Latest: v${retain}`);
console.log(`  ${toDeprecate.length} npm version(s) deprecated`);
console.log(`  ${toDelete.length} git tag(s) deleted`);
