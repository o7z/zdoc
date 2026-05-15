<script lang="ts">
	// Recursive form field: dispatches on a Shape and renders the correct
	// control. Operations bubble up via `onOp` carrying a path relative to the
	// root data tree, so the top-level EjsPreview can apply set/add/remove
	// edits with the helpers from form-gen.ts.
	import { untrack } from 'svelte';
	import type { Shape } from './extract.js';
	import type { PathSegment } from './form-gen.js';
	import Self from './FormField.svelte';

	type Op =
		| { kind: 'set'; path: PathSegment[]; value: unknown }
		| { kind: 'add'; path: PathSegment[]; element: Shape }
		| { kind: 'remove'; path: PathSegment[] }
		| { kind: 'move'; parentPath: PathSegment[]; from: number; to: number };

	let {
		shape,
		value,
		path = [],
		label,
		onOp,
		depth = 0,
	}: {
		shape: Shape;
		value: unknown;
		path?: PathSegment[];
		label?: string;
		onOp: (op: Op) => void;
		depth?: number;
	} = $props();

	// `depth` seeds the initial fold state; subsequent toggles are user-driven,
	// so untrack so the compiler doesn't bind `folded` to later `depth` changes.
	let folded = $state(untrack(() => depth >= 3));

	const fieldId = `ejs-field-${Math.random().toString(36).slice(2, 9)}`;

	function setValue(next: unknown) {
		onOp({ kind: 'set', path, value: next });
	}
</script>

{#if shape.kind === 'string'}
	<div class="ejs-form-field">
		{#if label}<label class="ejs-form-label" for={fieldId}>{label}</label>{/if}
		<input
			id={fieldId}
			type="text"
			class="ejs-form-input"
			value={typeof value === 'string' ? value : ''}
			oninput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
		/>
	</div>
{:else if shape.kind === 'boolean'}
	<div class="ejs-form-field ejs-form-field--inline">
		<input
			id={fieldId}
			type="checkbox"
			class="ejs-form-checkbox"
			checked={value === true}
			onchange={(e) => setValue((e.currentTarget as HTMLInputElement).checked)}
		/>
		{#if label}<label class="ejs-form-label" for={fieldId}>{label}</label>{/if}
	</div>
{:else if shape.kind === 'number'}
	<div class="ejs-form-field">
		{#if label}<label class="ejs-form-label" for={fieldId}>{label}</label>{/if}
		<input
			id={fieldId}
			type="number"
			class="ejs-form-input"
			value={typeof value === 'number' ? value : 0}
			oninput={(e) => {
				const n = Number((e.currentTarget as HTMLInputElement).value);
				setValue(Number.isFinite(n) ? n : 0);
			}}
		/>
	</div>
{:else if shape.kind === 'object'}
	<div class="ejs-form-field ejs-form-field--nested" class:ejs-form-folded={folded}>
		{#if label}
			<button
				type="button"
				class="ejs-form-fold-btn"
				aria-expanded={!folded}
				onclick={() => (folded = !folded)}
			>
				<span class="ejs-form-fold-caret" aria-hidden="true">{folded ? '▶' : '▼'}</span>
				<span class="ejs-form-label">{label}</span>
			</button>
		{/if}
		{#if !folded}
			<div class="ejs-form-children">
				{#each Object.entries(shape.properties) as [key, childShape] (key)}
					<Self
						shape={childShape}
						value={(value as Record<string, unknown> | null | undefined)?.[key]}
						path={[...path, key]}
						label={key}
						{onOp}
						depth={depth + 1}
					/>
				{/each}
				{#if Object.keys(shape.properties).length === 0}
					<div class="ejs-form-empty">（无字段）</div>
				{/if}
			</div>
		{/if}
	</div>
{:else if shape.kind === 'array'}
	{@const arr = Array.isArray(value) ? (value as unknown[]) : []}
	<div class="ejs-form-field ejs-form-field--nested" class:ejs-form-folded={folded}>
		<button
			type="button"
			class="ejs-form-fold-btn"
			aria-expanded={!folded}
			onclick={() => (folded = !folded)}
		>
			<span class="ejs-form-fold-caret" aria-hidden="true">{folded ? '▶' : '▼'}</span>
			<span class="ejs-form-label">{label ?? '列表'}</span>
			<span class="ejs-form-count">({arr.length} 项)</span>
		</button>
		{#if !folded}
			<div class="ejs-form-children ejs-form-array">
				{#each arr as item, i (i)}
					<div class="ejs-array-item">
						<div class="ejs-array-item-controls">
							<button
								type="button"
								class="ejs-form-icon-btn"
								aria-label={`将第 ${i + 1} 项上移`}
								disabled={i === 0}
								onclick={() => onOp({ kind: 'move', parentPath: path, from: i, to: i - 1 })}
							>
								↑
							</button>
							<button
								type="button"
								class="ejs-form-icon-btn"
								aria-label={`将第 ${i + 1} 项下移`}
								disabled={i === arr.length - 1}
								onclick={() => onOp({ kind: 'move', parentPath: path, from: i, to: i + 1 })}
							>
								↓
							</button>
							<button
								type="button"
								class="ejs-form-icon-btn ejs-form-icon-btn--danger"
								aria-label={`删除第 ${i + 1} 项`}
								onclick={() => onOp({ kind: 'remove', path: [...path, i] })}
							>
								×
							</button>
						</div>
						<div class="ejs-array-item-body">
							<Self
								shape={shape.element}
								value={item}
								path={[...path, i]}
								label={`第 ${i + 1} 项`}
								{onOp}
								depth={depth + 1}
							/>
						</div>
					</div>
				{/each}
				<button
					type="button"
					class="ejs-form-add-btn"
					onclick={() => onOp({ kind: 'add', path, element: shape.element })}
				>
					+ 添加一项
				</button>
			</div>
		{/if}
	</div>
{/if}
