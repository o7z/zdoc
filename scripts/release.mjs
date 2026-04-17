#!/usr/bin/env node
// One-shot release: stage everything, bump version, build, publish, push tags.
//
// Usage:
//   bun run release          # patch bump (default)
//   bun run release minor
//   bun run release major
//   bun run release 1.2.3    # explicit version
//
// What it does:
//   1. Builds first (fails before mutating anything if build is broken)
//   2. Stages every pending change (`git add -A`)
//   3. Runs `npm version <bump>` — bumps package.json, commits everything staged,
//      and tags `vX.Y.Z`
//   4. `npm publish --access public`
//   5. `git push --follow-tags`

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
process.chdir(repoRoot);

const arg = (process.argv[2] ?? 'patch').trim();
const valid = ['patch', 'minor', 'major'];
const isExplicit = /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(arg);
if (!valid.includes(arg) && !isExplicit) {
	fail(`Unknown bump: ${arg}. Use patch | minor | major | <semver>`);
}

function run(cmd, opts = {}) {
	console.log(`\n$ ${cmd}`);
	return execSync(cmd, { stdio: 'inherit', ...opts });
}

function capture(cmd) {
	return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function fail(msg) {
	console.error(`\nrelease aborted: ${msg}`);
	process.exit(1);
}

// 1. on main
const branch = capture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') fail(`expected branch "main", got "${branch}"`);

// 2. logged in to npm
let user;
try {
	user = capture('npm whoami');
} catch {
	fail('not logged in to npm — run `npm login` first');
}
console.log(`npm user: ${user}`);

// 3. show what we'll release
const pkgPath = join(repoRoot, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
console.log(`current version: ${pkg.version}  (bumping: ${arg})`);

// 4. clean working tree (commit first so the release commit stays focused)
const dirty = capture('git status --porcelain');
if (dirty) {
	console.error('\nrelease aborted: working tree has uncommitted changes:');
	console.error(dirty.split('\n').map((l) => '  ' + l).join('\n'));
	console.error('\nCommit (or stash) them first, then re-run `bun run release`.');
	process.exit(1);
}

// 5. build — fail before mutating git state
run('bun run build');

// 6. bump version (commits package.json + tags vX.Y.Z)
run(`npm version ${arg} -m "release: v%s"`);

// 7. publish
try {
	run('npm publish --access public');
} catch (err) {
	console.error('\nnpm publish failed. Version commit + tag are already created locally.');
	const v = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
	console.error('To retry:    npm publish --access public');
	console.error(`To roll back: git tag -d v${v} && git reset --hard HEAD~1`);
	throw err;
}

// 8. push commit + tag
run('git push --follow-tags origin main');

const newVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
console.log(`\n✔ released @o7z/zdoc@${newVersion}`);
console.log(`  https://www.npmjs.com/package/@o7z/zdoc/v/${newVersion}`);
