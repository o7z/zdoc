import { test, expect, describe } from 'bun:test';
import { detectAiAgent, formatAgentHint } from './agent-detect.ts';

describe('detectAiAgent', () => {
	test('returns null when no agent env is set', () => {
		expect(detectAiAgent({})).toBeNull();
	});

	test('CLAUDECODE=1 → Claude Code', () => {
		expect(detectAiAgent({ CLAUDECODE: '1' })).toEqual({
			name: 'Claude Code',
			envVar: 'CLAUDECODE',
		});
	});

	test('CLAUDE_CODE=true → Claude Code (alternate var)', () => {
		expect(detectAiAgent({ CLAUDE_CODE: 'true' })).toEqual({
			name: 'Claude Code',
			envVar: 'CLAUDE_CODE',
		});
	});

	test('CURSOR_AGENT=1 → Cursor', () => {
		expect(detectAiAgent({ CURSOR_AGENT: '1' })).toEqual({
			name: 'Cursor',
			envVar: 'CURSOR_AGENT',
		});
	});

	test('CURSOR_TRACE_ID=abc123 → Cursor (alternate var)', () => {
		expect(detectAiAgent({ CURSOR_TRACE_ID: 'abc123' })).toEqual({
			name: 'Cursor',
			envVar: 'CURSOR_TRACE_ID',
		});
	});

	test('OPENCODE=1 → OpenCode', () => {
		expect(detectAiAgent({ OPENCODE: '1' })).toEqual({
			name: 'OpenCode',
			envVar: 'OPENCODE',
		});
	});

	test('CLINE_ACTIVE=1 → Cline', () => {
		expect(detectAiAgent({ CLINE_ACTIVE: '1' })?.name).toBe('Cline');
	});

	test('AIDER_ACTIVE=1 → Aider', () => {
		expect(detectAiAgent({ AIDER_ACTIVE: '1' })?.name).toBe('Aider');
	});

	test('AI_AGENT=1 → generic AI agent (opt-in)', () => {
		expect(detectAiAgent({ AI_AGENT: '1' })?.name).toBe('AI agent');
	});

	test('ZDOC_AI_AGENT=1 → generic AI agent (zdoc-specific opt-in)', () => {
		expect(detectAiAgent({ ZDOC_AI_AGENT: '1' })?.name).toBe('AI agent');
	});

	test('empty string env value is treated as not set', () => {
		expect(detectAiAgent({ CLAUDECODE: '' })).toBeNull();
	});

	test('multiple agent vars set → first match wins (Claude Code precedence)', () => {
		expect(
			detectAiAgent({ CLAUDECODE: '1', CURSOR_AGENT: '1' })?.name,
		).toBe('Claude Code');
	});

	test('unrelated env vars do not trigger detection', () => {
		expect(
			detectAiAgent({
				PATH: '/usr/bin',
				NODE_ENV: 'production',
				HOME: '/home/u',
			}),
		).toBeNull();
	});
});

describe('formatAgentHint', () => {
	test('returns empty string for null', () => {
		expect(formatAgentHint(null)).toBe('');
	});

	test('formats hint line for detected agent', () => {
		const out = formatAgentHint({ name: 'Claude Code', envVar: 'CLAUDECODE' });
		expect(out).toContain('Claude Code detected');
		expect(out).toContain('zdoc skill');
		expect(out).toContain('https://github.com/o7z/zdoc#skills');
		expect(out.endsWith('\n')).toBe(true);
	});

	test('uses agent name in the hint', () => {
		const out = formatAgentHint({ name: 'OpenCode', envVar: 'OPENCODE' });
		expect(out).toContain('OpenCode detected');
		expect(out).not.toContain('Claude Code');
	});

	test('hint is a single line', () => {
		const out = formatAgentHint({ name: 'Cursor', envVar: 'CURSOR_AGENT' });
		const lines = out.split('\n').filter((l) => l.length > 0);
		expect(lines.length).toBe(1);
	});
});
