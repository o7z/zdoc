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
export {};
