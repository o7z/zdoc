import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAppVersion, VERSION_FALLBACK } from './app-version.ts';

// Read the real package.json once so tests stay in sync with whatever
// version is in flight.
const REAL_PKG_VERSION = JSON.parse(
	readFileSync(join(import.meta.dir, '..', '..', 'package.json'), 'utf-8'),
).version as string;

let savedEnv: string | undefined;

beforeEach(() => {
	savedEnv = process.env.ZDOC_VERSION;
});
afterEach(() => {
	if (savedEnv === undefined) delete process.env.ZDOC_VERSION;
	else process.env.ZDOC_VERSION = savedEnv;
});

describe('readAppVersion', () => {
	test('returns ZDOC_VERSION env var when set (cli.ts path)', () => {
		process.env.ZDOC_VERSION = '9.9.9-test';
		expect(readAppVersion()).toBe('9.9.9-test');
	});

	test('falls back to package.json walk-up when env unset', () => {
		delete process.env.ZDOC_VERSION;
		// Running from src/lib/app-version.test.ts → walk-up finds the project
		// package.json. Version must match what's on disk.
		expect(readAppVersion()).toBe(REAL_PKG_VERSION);
	});

	test('does NOT fall back to VERSION_FALLBACK when env unset on a real install', () => {
		// Regression for the v1.15.4 → v2.0.1 bug where readAppVersion always
		// returned 0.0.0 because __dirname/../package.json missed after build.
		// The walk-up should make this impossible during dev/test runs.
		delete process.env.ZDOC_VERSION;
		const v = readAppVersion();
		expect(v).not.toBe(VERSION_FALLBACK);
		expect(v).toMatch(/^\d+\.\d+\.\d+/);
	});

	test('env var takes precedence over filesystem lookup', () => {
		process.env.ZDOC_VERSION = '0.1.2-override';
		const v = readAppVersion();
		expect(v).toBe('0.1.2-override');
		expect(v).not.toBe(REAL_PKG_VERSION);
	});

	test('empty ZDOC_VERSION env still triggers fallback (treated as unset)', () => {
		// Set to empty string — current behavior: empty string is falsy in JS,
		// so the env path skips and the walk-up runs.
		process.env.ZDOC_VERSION = '';
		expect(readAppVersion()).toBe(REAL_PKG_VERSION);
	});
});
