<script lang="ts">
	// Top-level interactive preview for a single ```ejs code block.
	// Extracts variable shapes via extract.ts, builds a default data tree,
	// renders an inline panel containing (a) the template source, (b) a
	// generated form, and (c) a live preview pane backed by the Worker
	// sandbox. Re-renders are debounced and runtime errors are surfaced
	// without clobbering the last successful output.
	import { onMount, onDestroy, untrack } from 'svelte';
	import { extractTemplate, type Shape } from './extract.js';
	import {
		defaultDataForShape,
		setPath,
		appendArrayItem,
		removeArrayItem,
		moveArrayItem,
		type PathSegment,
	} from './form-gen.js';
	import { renderInWorker } from './sandbox.js';
	import FormField from './FormField.svelte';

	let { template }: { template: string } = $props();

	const extraction = extractTemplate(untrack(() => template));
	const shape: Shape & { kind: 'object' } = extraction.ok
		? extraction.shape
		: { kind: 'object', properties: {} };

	let data = $state<unknown>(defaultDataForShape(shape));
	let expanded = $state(true);
	let output = $state('');
	let lastError = $state<string | null>(null);

	let renderTimer: ReturnType<typeof setTimeout> | null = null;
	let renderSeq = 0;

	function scheduleRender() {
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(runRender, 120);
	}

	async function runRender() {
		const seq = ++renderSeq;
		// $state proxies aren't structured-cloneable across the Worker boundary,
		// so deep-snapshot the data into a plain object before sending.
		const snapshot = $state.snapshot(data) as Record<string, unknown>;
		const result = await renderInWorker(template, snapshot);
		if (seq !== renderSeq) return; // a newer render started before this one finished
		if (result.ok) {
			output = result.output ?? '';
			lastError = null;
		} else {
			lastError = result.error ?? '未知错误';
		}
	}

	function handleOp(
		op:
			| { kind: 'set'; path: PathSegment[]; value: unknown }
			| { kind: 'add'; path: PathSegment[]; element: Shape }
			| { kind: 'remove'; path: PathSegment[] }
			| { kind: 'move'; parentPath: PathSegment[]; from: number; to: number },
	) {
		switch (op.kind) {
			case 'set':
				data = setPath(data, op.path, op.value);
				break;
			case 'add':
				data = appendArrayItem(data, op.path, op.element);
				break;
			case 'remove':
				data = removeArrayItem(data, op.path);
				break;
			case 'move':
				data = moveArrayItem(data, op.parentPath, op.from, op.to);
				break;
		}
		scheduleRender();
	}

	function resetData() {
		data = defaultDataForShape(shape);
		scheduleRender();
	}

	let copied = $state(false);
	let sourceCopied = $state(false);

	async function copyOutput() {
		try {
			await navigator.clipboard.writeText(output);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* ignore */
		}
	}

	async function copySource() {
		try {
			await navigator.clipboard.writeText(template);
			sourceCopied = true;
			setTimeout(() => (sourceCopied = false), 1500);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		runRender();
	});

	onDestroy(() => {
		if (renderTimer) clearTimeout(renderTimer);
	});
</script>

{#if !extraction.ok}
	<!-- Extraction failed (function call / syntax error). Render as plain code
	     so the original ejs source still shows; no preview button. Use the
	     same .code-block structure as other code fences so the global copy
	     handler picks it up. -->
	<div class="code-block">
		<button class="code-copy" title="Copy">
			<svg class="code-copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<rect x="9" y="9" width="13" height="13" rx="2"></rect>
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
			</svg>
			<svg class="code-copy-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M20 6 9 17l-5-5"></path>
			</svg>
		</button>
		<pre><code class="language-ejs">{template}</code></pre>
	</div>
{:else}
	<div class="ejs-preview-container">
		<div class="ejs-preview-source">
			<pre><code>{template}</code></pre>
			<div class="ejs-preview-toolbar">
				<button
					type="button"
					class="ejs-icon-btn"
					class:copied={sourceCopied}
					title={sourceCopied ? '已复制' : '复制源码'}
					aria-label={sourceCopied ? '已复制源码' : '复制源码'}
					onclick={copySource}
				>
					{#if sourceCopied}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M20 6 9 17l-5-5"></path>
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
							<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
						</svg>
					{/if}
				</button>
				<button
					type="button"
					class="ejs-icon-btn"
					title={expanded ? '收起预览' : '展开预览'}
					aria-label={expanded ? '收起预览' : '展开预览'}
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="m18 15-6-6-6 6"></path>
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="m6 9 6 6 6-6"></path>
						</svg>
					{/if}
				</button>
			</div>
		</div>
		{#if expanded}
			<div class="ejs-preview-panel">
				<div class="ejs-preview-form">
					<div class="ejs-preview-form-header">
						<span class="ejs-preview-section-title">数据</span>
						<button
							type="button"
							class="ejs-icon-btn"
							title="重置数据"
							aria-label="重置数据"
							onclick={resetData}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
								<path d="M3 3v5h5"></path>
							</svg>
						</button>
					</div>
					{#if Object.keys(shape.properties).length === 0}
						<div class="ejs-form-empty">模板未引用任何变量。</div>
					{:else}
						{#each Object.entries(shape.properties) as [key, childShape] (key)}
							<FormField
								shape={childShape}
								value={(data as Record<string, unknown>)[key]}
								path={[key]}
								label={key}
								onOp={handleOp}
								depth={0}
							/>
						{/each}
					{/if}
				</div>
				<div class="ejs-preview-output">
					<div class="ejs-preview-output-header">
						<span class="ejs-preview-section-title">渲染结果</span>
						<button
							type="button"
							class="ejs-icon-btn"
							class:copied
							title={copied ? '已复制' : '复制渲染结果'}
							aria-label={copied ? '已复制' : '复制渲染结果'}
							onclick={copyOutput}
						>
							{#if copied}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M20 6 9 17l-5-5"></path>
								</svg>
							{:else}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
									<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
								</svg>
							{/if}
						</button>
					</div>
					{#if lastError}
						<div class="ejs-preview-error" role="alert">{lastError}</div>
					{/if}
					<pre class="ejs-preview-output-pane">{output}</pre>
				</div>
			</div>
		{/if}
	</div>
{/if}
