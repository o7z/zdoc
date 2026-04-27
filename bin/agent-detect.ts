// AI coding agent detection.
//
// Returns the human-readable name of the detected agent, or null if zdoc
// looks like it was launched by a human user. Uses environment-variable
// markers set by each agent's runtime — no process-tree probing.
//
// Detection deliberately leans conservative: when in doubt, return null
// so that human users see a clean banner. AI agents are fine seeing the
// hint multiple times — the cost of a missed detection (no hint shown
// to an agent that could've used it) is much smaller than the cost of
// nagging human users every launch.

export interface AgentInfo {
	name: string;       // e.g. "Claude Code"
	envVar: string;     // which env variable triggered the detection
}

interface AgentMarker {
	name: string;
	envVars: readonly string[]; // any one of these set (truthy) → detected
}

const AGENTS: readonly AgentMarker[] = [
	{ name: 'Claude Code', envVars: ['CLAUDECODE', 'CLAUDE_CODE'] },
	{ name: 'Cursor',      envVars: ['CURSOR_AGENT', 'CURSOR_TRACE_ID'] },
	{ name: 'OpenCode',    envVars: ['OPENCODE', 'OPENCODE_VERSION'] },
	{ name: 'Cline',       envVars: ['CLINE_ACTIVE'] },
	{ name: 'Aider',       envVars: ['AIDER_ACTIVE'] },
	{ name: 'Windsurf',    envVars: ['WINDSURF_ACTIVE'] },
	{ name: 'Continue',    envVars: ['CONTINUE_ACTIVE'] },
	{ name: 'Roo Code',    envVars: ['ROO_ACTIVE'] },
	{ name: 'AI agent',    envVars: ['AI_AGENT', 'ZDOC_AI_AGENT'] }, // generic opt-in
];

export function detectAiAgent(
	env: NodeJS.ProcessEnv = process.env,
): AgentInfo | null {
	for (const m of AGENTS) {
		for (const v of m.envVars) {
			if (env[v]) return { name: m.name, envVar: v };
		}
	}
	return null;
}

// Format the hint line that goes into zdoc's startup banner.
// Returns empty string when no agent is detected (caller can write it
// unconditionally without a guard).
export function formatAgentHint(info: AgentInfo | null): string {
	if (!info) return '';
	return `  💡 ${info.name} detected. zdoc skill for AI-assisted authoring: https://github.com/o7z/zdoc#skills\n`;
}
