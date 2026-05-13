// EJS template variable extraction.
//
// Compiles an EJS template body with default options (which wraps the body
// in `with (locals || {}) { … }`), parses the compiled JS with acorn, then
// walks the AST to:
//   1. Reject templates containing any function call other than EJS's own
//      internal helpers (escapeFn / __append / include). Returns
//      `reason: 'has-function-calls'`.
//   2. Build a Shape tree for the data the template consumes, by tracking
//      every free-identifier usage inside the `with` block. For loop
//      variables (`for (const item of items)`) the loop variable is bound to
//      "element of items" so usages inside the body shape the element type.
//
// The returned Shape always has kind: 'object' at the root — its properties
// are the top-level data fields the template needs.

import ejsModule from 'ejs';
import { parse } from 'acorn';
import type { Node } from 'acorn';

const ejs = (ejsModule as unknown as { Template?: typeof EjsTemplate; default?: { Template: typeof EjsTemplate } });

interface EjsTemplate {
	source: string;
	compile(): void;
}

interface EjsTemplateCtor {
	new (src: string, opts: Record<string, unknown>): EjsTemplate;
}

function getTemplateCtor(): EjsTemplateCtor {
	const candidate = ejs.default?.Template ?? ejs.Template;
	if (!candidate) throw new Error('ejs.Template is not available');
	return candidate as unknown as EjsTemplateCtor;
}

// Identifiers injected by EJS that should not be treated as user data.
const EJS_INTERNALS = new Set([
	'__output',
	'__append',
	'__line',
	'escapeFn',
	'include',
	'rethrow',
	'locals',
	'undefined',
	'utils',
]);

// Globals tolerated as references but never as call targets (they're not data).
const JS_GLOBALS = new Set([
	'Math',
	'Number',
	'String',
	'Boolean',
	'Array',
	'Object',
	'JSON',
	'Date',
	'NaN',
	'Infinity',
	'console',
]);

export type Shape =
	| { kind: 'string' }
	| { kind: 'boolean' }
	| { kind: 'number' }
	| { kind: 'array'; element: Shape }
	| { kind: 'object'; properties: Record<string, Shape> };

export type ExtractResult =
	| { ok: true; shape: Shape & { kind: 'object' } }
	| {
			ok: false;
			reason: 'has-function-calls' | 'syntax-error' | 'compile-error';
			message?: string;
	  };

// Compile the EJS template body and return the JS source produced by EJS.
function compileToBody(template: string): string {
	const Template = getTemplateCtor();
	const t = new Template(template, {});
	t.compile();
	return t.source;
}

// Find every CallExpression in the with-block that targets a non-internal,
// non-global identifier. Method calls like `arr.forEach(…)` count as
// function calls too — anything with parentheses fails this check.
function findUserCall(withBody: Node): boolean {
	let found = false;
	function visit(n: unknown) {
		if (found) return;
		if (!n || typeof n !== 'object') return;
		const node = n as Record<string, unknown> & { type?: string };
		if (node.type === 'CallExpression') {
			const callee = node.callee as Record<string, unknown> & { type?: string; name?: string };
			// EJS-internal direct calls are fine.
			if (callee?.type === 'Identifier' && callee.name && EJS_INTERNALS.has(callee.name)) {
				// keep traversing the arguments — they may contain user calls
			} else {
				found = true;
				return;
			}
		}
		for (const key of Object.keys(node)) {
			if (key === 'type' || key === 'loc' || key === 'range') continue;
			const v = node[key];
			if (Array.isArray(v)) for (const item of v) visit(item);
			else if (v && typeof v === 'object') visit(v);
		}
	}
	visit(withBody);
	return found;
}

// -----------------------------------------------------------------------------
// Shape building
// -----------------------------------------------------------------------------

// A reference target tells us where to merge type information. It points
// either at the root shape (for top-level locals) or at the element shape of
// some array (for loop variables, transitively).
type Target =
	| { kind: 'root'; properties: Record<string, Shape> }
	| { kind: 'array-element-of'; parent: Target; arrayName: string };

// Resolve a target to its concrete container (a Record<string, Shape>),
// allocating array/object containers along the way as needed.
function resolveContainer(target: Target): Record<string, Shape> {
	if (target.kind === 'root') return target.properties;
	const parent = resolveContainer(target.parent);
	const existing = parent[target.arrayName];
	let arr: Shape & { kind: 'array' };
	if (existing && existing.kind === 'array') {
		arr = existing;
	} else {
		arr = { kind: 'array', element: { kind: 'string' } };
		parent[target.arrayName] = arr;
	}
	if (arr.element.kind !== 'object') {
		// Loop variable was previously inferred as a primitive; promote to object
		// to host new property accesses (this happens for e.g. `<%= x %>` then
		// later `<%= x.y %>` inside the same loop).
		arr.element = { kind: 'object', properties: {} };
	}
	return arr.element.properties;
}

// Merge a primitive observation into an existing shape, picking the most
// constraining type. Order of specificity: object/array > number > boolean > string.
function mergePrimitive(existing: Shape | undefined, observed: Shape): Shape {
	if (!existing) return observed;
	if (existing.kind === 'object' || existing.kind === 'array') return existing;
	if (observed.kind === 'object' || observed.kind === 'array') return observed;
	const rank: Record<string, number> = { string: 0, boolean: 1, number: 2 };
	return rank[observed.kind] > rank[existing.kind] ? observed : existing;
}

// Walk a member-expression chain like a.b.c starting from a base Identifier
// and ensure each intermediate slot exists as an object container. Returns
// the leaf name and its parent container.
function descendChain(
	rootContainer: Record<string, Shape>,
	baseName: string,
	path: string[],
): { container: Record<string, Shape>; leaf: string } {
	let container = rootContainer;
	let cur = baseName;
	for (const seg of path) {
		const existing = container[cur];
		if (!existing || existing.kind !== 'object') {
			const obj: Shape = { kind: 'object', properties: {} };
			container[cur] = obj;
			container = (obj as { properties: Record<string, Shape> }).properties;
		} else {
			container = (existing as { properties: Record<string, Shape> }).properties;
		}
		cur = seg;
	}
	return { container, leaf: cur };
}

// Decide the shape that applies to `ident` based on the surrounding context.
// `ancestors` are nodes from outermost (Program) to innermost (parent of ident).
function inferUsage(
	ident: Record<string, unknown> & { type?: string },
	ancestors: Array<Record<string, unknown> & { type?: string }>,
): { path: string[]; shape: Shape } {
	// 1. Walk up MemberExpression chain to build the access path
	let cur: Record<string, unknown> = ident;
	let i = ancestors.length - 1;
	const path: string[] = [];
	while (i >= 0) {
		const parent = ancestors[i];
		if (
			parent.type === 'MemberExpression' &&
			(parent as { object?: unknown }).object === cur &&
			!(parent as { computed?: boolean }).computed
		) {
			const prop = (parent as { property?: Record<string, unknown> & { name?: string } }).property;
			if (prop && prop.type === 'Identifier' && typeof prop.name === 'string') {
				path.push(prop.name);
				cur = parent;
				i--;
				continue;
			}
		}
		break;
	}
	// 2. Look at the *next* enclosing node to decide the leaf type
	const ctx = i >= 0 ? ancestors[i] : null;
	const ctxParent = i - 1 >= 0 ? ancestors[i - 1] : null;
	let leafShape: Shape = { kind: 'string' };

	if (ctx) {
		if (
			ctx.type === 'IfStatement' &&
			(ctx as { test?: unknown }).test === cur
		) {
			leafShape = { kind: 'boolean' };
		} else if (
			ctx.type === 'ConditionalExpression' &&
			(ctx as { test?: unknown }).test === cur
		) {
			leafShape = { kind: 'boolean' };
		} else if (ctx.type === 'LogicalExpression') {
			leafShape = { kind: 'boolean' };
		} else if (ctx.type === 'UnaryExpression' && (ctx as { operator?: string }).operator === '!') {
			leafShape = { kind: 'boolean' };
		} else if (ctx.type === 'BinaryExpression') {
			const op = (ctx as { operator?: string }).operator ?? '';
			if (['+', '-', '*', '/', '%', '**'].includes(op)) {
				// Could be string concat if op === '+' and a string literal is on the other side.
				if (op === '+') {
					const other =
						(ctx as { left?: unknown; right?: unknown }).left === cur
							? (ctx as { right?: Record<string, unknown> }).right
							: (ctx as { left?: Record<string, unknown> }).left;
					if (other && (other as { type?: string }).type === 'Literal' && typeof (other as { value?: unknown }).value === 'string') {
						leafShape = { kind: 'string' };
					} else {
						leafShape = { kind: 'number' };
					}
				} else {
					leafShape = { kind: 'number' };
				}
			} else if (['>', '<', '>=', '<='].includes(op)) {
				leafShape = { kind: 'number' };
			} else if (['===', '!==', '==', '!='].includes(op)) {
				const other =
					(ctx as { left?: unknown; right?: unknown }).left === cur
						? (ctx as { right?: Record<string, unknown> }).right
						: (ctx as { left?: Record<string, unknown> }).left;
				if (other && (other as { type?: string }).type === 'Literal') {
					const value = (other as { value?: unknown }).value;
					if (typeof value === 'boolean') leafShape = { kind: 'boolean' };
					else if (typeof value === 'number') leafShape = { kind: 'number' };
					else leafShape = { kind: 'string' };
				}
			}
		} else if (ctx.type === 'UpdateExpression') {
			leafShape = { kind: 'number' };
		}
	}

	// Property-chain accesses always imply object at every intermediate node.
	// The leaf type is what we just inferred. descendChain handles the object
	// promotion for the path; the caller assigns leafShape to the leaf slot.
	void ctxParent; // reserved for future heuristics
	return { path, shape: leafShape };
}

// -----------------------------------------------------------------------------
// Scope-aware walk
// -----------------------------------------------------------------------------

// A binding tells us, for a name visible in scope, whether it refers to a
// locals-root field or to a loop element.
type Binding =
	| { kind: 'locals' } // name accesses locals.<name>
	| { kind: 'loop-element'; target: Target }; // name = element of an array target

type Scope = Map<string, Binding>;

// Top-level recursion entry: walk a node, when we hit identifiers, dispatch
// to the shape-merge logic; when we hit ForOfStatement, introduce a new scope.
function walkScope(
	node: unknown,
	ancestors: Array<Record<string, unknown> & { type?: string }>,
	scopes: Scope[],
	rootProperties: Record<string, Shape>,
): void {
	if (!node || typeof node !== 'object') return;
	const n = node as Record<string, unknown> & { type?: string };

	if (n.type === 'Identifier') {
		const name = n.name as string;
		if (EJS_INTERNALS.has(name) || JS_GLOBALS.has(name)) return;
		// Skip identifiers used as property accessors in non-computed member expressions.
		const parent = ancestors[ancestors.length - 1];
		if (
			parent &&
			parent.type === 'MemberExpression' &&
			(parent as { property?: unknown }).property === n &&
			!(parent as { computed?: boolean }).computed
		) {
			return;
		}
		// Skip identifiers that are the binding side of a declaration.
		if (parent && (parent.type === 'VariableDeclarator' || parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression')) {
			// VariableDeclarator.id is the binding; .init is the initializer
			if (parent.type === 'VariableDeclarator' && (parent as { id?: unknown }).id === n) return;
			if ((parent as { id?: unknown }).id === n) return;
		}
		// Skip identifiers in shorthand keys / param defaults / catch params.
		if (parent && parent.type === 'CatchClause' && (parent as { param?: unknown }).param === n) return;

		const binding = resolveBinding(name, scopes);
		const { path, shape } = inferUsage(n, ancestors);
		// Compute the container into which we'll merge.
		let container: Record<string, Shape>;
		let baseName: string;
		if (binding?.kind === 'loop-element') {
			if (path.length === 0) {
				// Loop var used directly (e.g. `<%= item %>`) — apply leaf shape
				// to the array.element itself. Do NOT call resolveContainer on the
				// loop-element target here, because that side-effects element to
				// object {} which would clobber a primitive element type.
				const arrayContainerTarget = binding.target;
				if (arrayContainerTarget.kind === 'array-element-of') {
					const parentContainer = resolveContainer(arrayContainerTarget.parent);
					const arr = parentContainer[arrayContainerTarget.arrayName];
					if (arr && arr.kind === 'array') {
						arr.element = mergePrimitive(arr.element, shape);
					}
				}
				return;
			}
			// Property access on a loop var → descend into the element-object.
			container = resolveContainer(binding.target);
			baseName = path[0];
			const rest = path.slice(1);
			const descended = descendChain(container, baseName, rest);
			descended.container[descended.leaf] = mergePrimitive(descended.container[descended.leaf], shape);
			return;
		}
		// Top-level locals reference
		container = rootProperties;
		baseName = name;
		if (path.length === 0) {
			container[baseName] = mergePrimitive(container[baseName], shape);
			return;
		}
		const descended = descendChain(container, baseName, path);
		descended.container[descended.leaf] = mergePrimitive(descended.container[descended.leaf], shape);
		return;
	}

	if (n.type === 'ForOfStatement' || n.type === 'ForInStatement') {
		// Determine the array source (n.right) and the loop variable name.
		const right = n.right as Record<string, unknown> & { type?: string };
		const left = n.left as Record<string, unknown> & { type?: string };
		// Walk right side in current scope to register the array as a top-level
		// variable. Mark it as array kind.
		// First: figure out which top-level name the right side refers to.
		const arrayTarget = resolveArrayTarget(right, scopes, rootProperties);
		// Also walk into right (in case it's a deep expression) to record uses
		// — but skip the array-target itself which we just stamped.
		walkChildren(n.right, ancestors.concat(n), scopes, rootProperties);

		// Extract loop variable name(s)
		const loopVarNames: string[] = [];
		if (left.type === 'VariableDeclaration') {
			const decls = (left as { declarations?: Array<{ id?: { name?: string } }> }).declarations ?? [];
			for (const d of decls) if (d.id?.name) loopVarNames.push(d.id.name);
		} else if (left.type === 'Identifier') {
			if ((left as { name?: string }).name) loopVarNames.push((left as { name: string }).name);
		}
		const newScope: Scope = new Map();
		for (const v of loopVarNames) {
			if (arrayTarget) newScope.set(v, { kind: 'loop-element', target: arrayTarget });
		}
		walkScope(n.body, ancestors.concat(n), scopes.concat(newScope), rootProperties);
		return;
	}

	if (
		n.type === 'FunctionDeclaration' ||
		n.type === 'FunctionExpression' ||
		n.type === 'ArrowFunctionExpression'
	) {
		// Don't recurse into nested function bodies — they have their own scope and
		// the call-detection pass would have already rejected templates using them.
		return;
	}

	// Default: recurse into children, tracking new lexical scopes for blocks.
	if (n.type === 'BlockStatement') {
		walkChildren(n, ancestors, scopes.concat(new Map()), rootProperties);
		return;
	}
	walkChildren(n, ancestors, scopes, rootProperties);
}

function walkChildren(
	node: unknown,
	ancestors: Array<Record<string, unknown> & { type?: string }>,
	scopes: Scope[],
	rootProperties: Record<string, Shape>,
): void {
	if (!node || typeof node !== 'object') return;
	const n = node as Record<string, unknown> & { type?: string };
	const childAncestors = ancestors.concat(n);
	for (const key of Object.keys(n)) {
		if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
		const v = n[key];
		if (Array.isArray(v)) {
			for (const item of v) walkScope(item, childAncestors, scopes, rootProperties);
		} else if (v && typeof v === 'object') {
			walkScope(v, childAncestors, scopes, rootProperties);
		}
	}
}

function resolveBinding(name: string, scopes: Scope[]): Binding | undefined {
	for (let i = scopes.length - 1; i >= 0; i--) {
		const b = scopes[i].get(name);
		if (b) return b;
	}
	return undefined;
}

// Given the right side of a for-of statement (an expression), figure out
// the array slot it points to, and stamp that slot as array kind in the
// appropriate container. Returns a Target whose array-element-of branch can
// be used as a binding for the loop variable. Supports:
//   • `items` (bare identifier → top-level array)
//   • `obj.items` (member expression chain → nested array)
//   • `outerItem.children` where outerItem is itself a loop-element binding
//     (transitive array nesting)
function resolveArrayTarget(
	right: Record<string, unknown> & { type?: string },
	scopes: Scope[],
	rootProperties: Record<string, Shape>,
): Target | null {
	// Collect identifier base + dotted path
	const path: string[] = [];
	let cur: Record<string, unknown> & { type?: string } = right;
	while (cur.type === 'MemberExpression' && !(cur as { computed?: boolean }).computed) {
		const prop = (cur as { property?: Record<string, unknown> & { name?: string } }).property;
		if (prop?.type === 'Identifier' && typeof prop.name === 'string') {
			path.unshift(prop.name);
			cur = (cur as { object?: Record<string, unknown> & { type?: string } }).object ?? cur;
		} else {
			return null;
		}
	}
	if (cur.type !== 'Identifier') return null;
	const baseName = (cur as { name?: string }).name;
	if (!baseName) return null;
	if (EJS_INTERNALS.has(baseName) || JS_GLOBALS.has(baseName)) return null;

	const binding = resolveBinding(baseName, scopes);
	let parentTarget: Target;
	if (binding?.kind === 'loop-element') {
		parentTarget = binding.target;
		// path applies to the loop element's object
	} else {
		parentTarget = { kind: 'root', properties: rootProperties };
	}

	if (binding?.kind === 'loop-element') {
		// Stamp empty object at the leaf so we can hang array on it.
		const container = resolveContainer(parentTarget);
		const descended = descendChain(container, path[0] ?? baseName, path.slice(1));
		// Above we use path[0] as base, but for a loop-element the base name is
		// not part of the locals path — the loop var maps to the element shape
		// directly. So a `for (const tag of item.tags)` with `item` being loop
		// element: baseName='item' (binding=loop-element), path=['tags'].
		// We need to merge "tags" into the element shape of the outer array.
		if (path.length === 0) return null;
		const elementContainer = resolveContainer(parentTarget);
		const inner = descendChainForArray(elementContainer, path);
		inner.container[inner.leaf] = inner.container[inner.leaf] && inner.container[inner.leaf].kind === 'array'
			? inner.container[inner.leaf]
			: { kind: 'array', element: { kind: 'string' } };
		void descended;
		return { kind: 'array-element-of', parent: parentTarget, arrayName: inner.leaf };
	} else {
		// Top-level array binding
		const container = resolveContainer(parentTarget);
		if (path.length === 0) {
			container[baseName] = container[baseName] && container[baseName].kind === 'array'
				? container[baseName]
				: { kind: 'array', element: { kind: 'string' } };
			return { kind: 'array-element-of', parent: parentTarget, arrayName: baseName };
		}
		const descended = descendChain(container, baseName, path);
		descended.container[descended.leaf] = descended.container[descended.leaf] && descended.container[descended.leaf].kind === 'array'
			? descended.container[descended.leaf]
			: { kind: 'array', element: { kind: 'string' } };
		return { kind: 'array-element-of', parent: parentTarget, arrayName: descended.leaf };
	}
}

function descendChainForArray(
	root: Record<string, Shape>,
	path: string[],
): { container: Record<string, Shape>; leaf: string } {
	let container = root;
	for (let i = 0; i < path.length - 1; i++) {
		const seg = path[i];
		const existing = container[seg];
		if (!existing || existing.kind !== 'object') {
			const obj: Shape = { kind: 'object', properties: {} };
			container[seg] = obj;
			container = (obj as { properties: Record<string, Shape> }).properties;
		} else {
			container = (existing as { properties: Record<string, Shape> }).properties;
		}
	}
	return { container, leaf: path[path.length - 1] };
}

// -----------------------------------------------------------------------------
// Public entry
// -----------------------------------------------------------------------------

export function extractTemplate(source: string): ExtractResult {
	// Step 1: compile EJS to JS body
	let bodySource: string;
	try {
		bodySource = compileToBody(source);
	} catch (err) {
		return { ok: false, reason: 'syntax-error', message: err instanceof Error ? err.message : String(err) };
	}

	// Step 2: parse the body. EJS produces a body that ends in `return __output;`,
	// which is not legal at the Script top level. Wrap it in a function.
	let ast: Node;
	try {
		ast = parse(`function __wrap() {\n${bodySource}\n}`, { ecmaVersion: 'latest' });
	} catch (err) {
		return { ok: false, reason: 'syntax-error', message: err instanceof Error ? err.message : String(err) };
	}

	// Step 3: navigate to the with-block body
	const withBlock = findWithBlock(ast);
	if (!withBlock) {
		// Template has no logic / no variable references — return empty shape
		return { ok: true, shape: { kind: 'object', properties: {} } };
	}

	// Step 4: reject if any user-defined function call exists
	if (findUserCall(withBlock)) {
		return { ok: false, reason: 'has-function-calls' };
	}

	// Step 5: walk and collect shapes
	const rootProperties: Record<string, Shape> = {};
	walkScope(withBlock, [], [new Map()], rootProperties);

	return { ok: true, shape: { kind: 'object', properties: rootProperties } };
}

function findWithBlock(ast: Node): Record<string, unknown> | null {
	let found: Record<string, unknown> | null = null;
	function v(n: unknown) {
		if (found) return;
		if (!n || typeof n !== 'object') return;
		const node = n as Record<string, unknown> & { type?: string };
		if (node.type === 'WithStatement') {
			found = node.body as Record<string, unknown>;
			return;
		}
		for (const key of Object.keys(node)) {
			if (key === 'type' || key === 'loc' || key === 'range') continue;
			const val = node[key];
			if (Array.isArray(val)) for (const it of val) v(it);
			else if (val && typeof val === 'object') v(val);
		}
	}
	v(ast);
	return found;
}
