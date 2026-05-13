// zdoc fix — shared type definitions for the fix engine.
//
// The fix engine is intentionally decoupled from the lint engine: although
// both walk the same docs tree, fix operates on the SOURCE TEXT of a file
// (so changes can be applied as deterministic string→string rewrites) while
// lint operates only on the parsed model. Recipes encapsulate one
// detection + (optional) rewrite pair.
//
// US-001 — foundation only. Recipe array is empty for this story; later
// stories will register the five planned recipes.

// -----------------------------------------------------------------------------
// _meta.yaml mini-types (duplicated from meta-mini.ts so fix/ doesn't reach
// across bin/ root-level files via deep import. tsconfig.bin.json's rootDir
// is bin/, but we re-export from meta-mini.js inside engine.ts; these aliases
// stay here so recipes can import types without pulling in the parser).
// -----------------------------------------------------------------------------

export type Lifecycle = 'draft' | 'stable' | 'archived';

export interface PageMeta {
	title?: string;
	order?: number;
	modified?: string;
	env?: string;
	description?: string;
	author?: string;
	lifecycle?: Lifecycle;
	superseded_by?: string;
	folded_to?: string;
}

export interface DirMeta {
	title?: string;
	order?: number;
	env?: string;
	pages?: Record<string, PageMeta>;
}

// -----------------------------------------------------------------------------
// Scan model
// -----------------------------------------------------------------------------

export interface DocsScan {
	docsDir: string;
	metaFiles: string[];        // absolute paths to all _meta.yaml files
	mdFiles: Set<string>;       // absolute paths to all .md files
	// Recipes that need extra structure (e.g. parsed DirMeta per file) can
	// read it lazily from sources/sourceShas; the engine intentionally does
	// not pre-parse to keep US-001 minimal.
}

// -----------------------------------------------------------------------------
// Recipe contract
// -----------------------------------------------------------------------------

export interface Finding<P = unknown> {
	recipeId: string;
	file: string;          // absolute path to the file that would be rewritten
	message: string;       // human-readable, zh-CN
	manualReview?: boolean; // true → engine.apply skips this finding (read-only recipe)
	payload?: P;           // recipe-specific data the apply() function needs
}

export interface Recipe<P = unknown> {
	id: string;            // e.g. 'register-orphan'
	description: string;   // one-line zh-CN for --help listing
	autoFix: boolean;      // false for read-only findings (e.g. prune-missing-page)
	detect(scan: DocsScan, sources: Map<string, string>): Finding<P>[];
	// apply is omitted for non-autoFix recipes. When present, it must be a
	// pure function: given the current source text of finding.file and the
	// finding payload, return the new source text.
	apply?(finding: Finding<P>, before: string): string;
}

// -----------------------------------------------------------------------------
// Engine result types
// -----------------------------------------------------------------------------

export interface ScanResult {
	scan: DocsScan;
	findings: Finding[];
	sourceShas: Map<string, string>;   // absolute path → sha256 of source at scan time
	sources: Map<string, string>;      // absolute path → file content at scan time
}

export interface ApplyResult {
	written: { file: string; recipeIds: string[] }[];
	failed: { file: string; reason: string }[];
}

// -----------------------------------------------------------------------------
// CLI option bag (consumed by engine.scan / engine.apply)
// -----------------------------------------------------------------------------

export interface ScanOptions {
	recipeId?: string;   // if set, only run recipes whose id matches
}
