<script>
	import { onMount, onDestroy } from 'svelte';

	let { data } = $props();
	let activeId = $state('');
	let mainEl = $state(null);

	/** @type {() => void} */
	let cleanupSpy = () => {};

	onMount(() => {
		if (data.kind === 'md') {
			initMermaid();
			initEjsPreview();
		}
		setupScrollSpy();
	});

	$effect(() => {
		data.html;
		if (typeof window !== 'undefined' && data.kind === 'md') {
			requestAnimationFrame(() => {
				initMermaid();
				initEjsPreview();
				setupScrollSpy();
			});
		}
	});

	async function initEjsPreview() {
		if (typeof window === 'undefined') return;
		const blocks = document.querySelectorAll('pre.ejs-preview:not([data-ejs-mounted])');
		if (blocks.length === 0) return;
		const { mount } = await import('svelte');
		const { default: EjsPreview } = await import('$lib/ejs-preview/EjsPreview.svelte');
		for (const block of blocks) {
			const el = /** @type {HTMLElement} */ (block);
			if (el.dataset.ejsMounted) continue;
			el.dataset.ejsMounted = 'true';
			const template = el.textContent ?? '';
			const wrapper = document.createElement('div');
			wrapper.className = 'ejs-preview-mount';
			el.replaceWith(wrapper);
			mount(EjsPreview, {
				target: wrapper,
				props: { template },
			});
		}
	}

	onDestroy(() => cleanupSpy());

	function setupScrollSpy() {
		cleanupSpy();
		if (data.kind !== 'md') return;
		const headings = data.headings ?? [];
		if (headings.length < 2) return;

		const container = mainEl?.querySelector('.doc-content');
		if (!container) return;

		const offset = 100;

		function update() {
			let current = headings[0].slug;
			for (const h of headings) {
				const el = document.getElementById(h.slug);
				if (!el) continue;
				const rect = el.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();
				if (rect.top - containerRect.top < offset) current = h.slug;
				else break;
			}
			activeId = current;
		}

		update();
		container.addEventListener('scroll', update, { passive: true });
		cleanupSpy = () => container.removeEventListener('scroll', update);
	}

		function flashBtn(btn, checkSvg) {
			const orig = btn.innerHTML;
			btn.innerHTML = checkSvg;
			setTimeout(() => { btn.innerHTML = orig; }, 1500);
		}

		const checkIcon = `<svg class="lucide lucide-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

		async function copyMermaidSource(code, btn) {
			try {
				await navigator.clipboard.writeText(code);
				flashBtn(btn, checkIcon);
			} catch { /* noop */ }
		}

		async function copyMermaidImage(viewport, btn) {
			const svgEl = viewport.querySelector('svg');
			if (!svgEl) return;

		const clone = svgEl.cloneNode(true);
		const allEls = clone.querySelectorAll('*');
		const origAllEls = svgEl.querySelectorAll('*');
		const props = ['fill', 'stroke', 'color', 'font-family', 'font-size', 'background'];

		allEls.forEach((el, i) => {
			const orig = origAllEls[i];
			if (!orig) return;
			const cs = getComputedStyle(orig);
			for (const p of props) {
				const v = cs.getPropertyValue(p);
				if (v) el.style.setProperty(p, v);
			}
		});

			const vb = svgEl.getAttribute('viewBox')?.split(' ').map(Number);
			const w = vb?.[2] || svgEl.getBoundingClientRect().width;
			const h = vb?.[3] || svgEl.getBoundingClientRect().height;
			clone.setAttribute('width', String(w));
			clone.setAttribute('height', String(h));

			const serializer = new XMLSerializer();
			const svgStr = serializer.serializeToString(clone);
			const base64 = btoa(unescape(encodeURIComponent(svgStr)));
			const dataUrl = `data:image/svg+xml;base64,${base64}`;

			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				const dpr = window.devicePixelRatio || 1;
				const canvas = document.createElement('canvas');
				canvas.width = w * dpr;
				canvas.height = h * dpr;
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				ctx.scale(dpr, dpr);
				ctx.drawImage(img, 0, 0, w, h);

				try {
					canvas.toBlob(async (blob) => {
						if (!blob) { downloadAsSvg(); return; }
						try {
							await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
							flashBtn(btn, checkIcon);
						} catch {
							const a = document.createElement('a');
							a.href = URL.createObjectURL(blob);
							a.download = 'mermaid-diagram.png';
							a.click();
							URL.revokeObjectURL(a.href);
							flashBtn(btn, checkIcon);
						}
					}, 'image/png');
				} catch {
					downloadAsSvg();
				}
			};

			img.onerror = () => {
				downloadAsSvg();
			};

			function downloadAsSvg() {
				const a = document.createElement('a');
				a.href = dataUrl;
				a.download = 'mermaid-diagram.svg';
				a.click();
				flashBtn(btn, checkIcon);
			}

			img.src = dataUrl;
		}

		async function initMermaid() {
		const blocks = document.querySelectorAll('pre.mermaid');
		if (blocks.length === 0) return;

		const mermaid = (await import('mermaid')).default;
		const panzoom = (await import('@panzoom/panzoom')).default;

		const isDark = document.documentElement.classList.contains('dark');
		mermaid.initialize({
			startOnLoad: false,
			theme: isDark ? 'dark' : 'default',
			securityLevel: 'loose',
		});

		for (const block of blocks) {
			if (block.dataset.rendered) continue;
			block.dataset.rendered = 'true';

			const code = block.textContent || '';
			const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
			try {
				const { svg } = await mermaid.render(id, code);

				const wrapper = document.createElement('div');
				wrapper.className = 'mermaid-rendered';

				const toolbar = document.createElement('div');
				toolbar.className = 'mermaid-viewer-control-panel';
				toolbar.innerHTML = `
					<button class="mvcp-btn" data-action="zoom-in" title="Zoom in" aria-label="Zoom in"><svg class="lucide lucide-zoom-in" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg></button>
					<button class="mvcp-btn" data-action="zoom-out" title="Zoom out" aria-label="Zoom out"><svg class="lucide lucide-zoom-out" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg></button>
					<button class="mvcp-btn" data-action="reset" title="Reset view" aria-label="Reset view"><svg class="lucide lucide-rotate-ccw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
					<button class="mvcp-btn" data-action="copy-source" title="Copy source" aria-label="Copy source"><svg class="lucide lucide-copy" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
					<button class="mvcp-btn" data-action="copy-image" title="Copy as image" aria-label="Copy as image"><svg class="lucide lucide-image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></button>
				`;

				const viewport = document.createElement('div');
				viewport.className = 'mermaid-viewport';
				viewport.innerHTML = svg;

				wrapper.appendChild(toolbar);
				wrapper.appendChild(viewport);

				block.replaceWith(wrapper);

				if (!viewport.isConnected) {
					await new Promise(resolve => requestAnimationFrame(resolve));
				}

				const pzInstance = panzoom(viewport, {
					smoothScroll: true,
					maxZoom: 5,
					minZoom: 0.3,
					startScale: 1,
					contain: false,
					force3d: false,
				});

				toolbar.querySelector('[data-action="zoom-in"]')?.addEventListener('click', () => pzInstance.zoomIn());
				toolbar.querySelector('[data-action="zoom-out"]')?.addEventListener('click', () => pzInstance.zoomOut());
				toolbar.querySelector('[data-action="reset"]')?.addEventListener('click', () => pzInstance.reset());
				toolbar.querySelector('[data-action="copy-source"]')?.addEventListener('click', (e) => {
					copyMermaidSource(code, e.currentTarget);
				});
				toolbar.querySelector('[data-action="copy-image"]')?.addEventListener('click', (e) => {
					copyMermaidImage(viewport, e.currentTarget);
				});

				viewport.addEventListener('dblclick', (e) => {
					e.preventDefault();
					pzInstance.reset();
				});
			} catch (e) {
				console.error('Mermaid render error:', e);
			}
		}
	}
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

{#if data.kind === 'pdf'}
	<div class="pdf-frame">
		<iframe src={data.pdfUrl} title={data.title}></iframe>
	</div>
{:else}
	<div class="content-wrap" bind:this={mainEl}>
		<article class="doc-content">
			{#if data.meta}
				{@const m = data.meta}
				{@const chips = [m.modified, m.author].filter(Boolean)}
				<div class="doc-meta">
					{#if m.description}
						<p class="doc-desc">{m.description}</p>
					{/if}
					{#if chips.length > 0}
						<div class="doc-chips">
							{#each chips as chip, i}
								{#if i > 0}<span class="sep">·</span>{/if}
								<span>{chip}</span>
							{/each}
						</div>
					{/if}
					{#if m.superseded_by}
						<div class="doc-banner doc-banner-superseded">
							<span class="doc-banner-icon">⚠</span>
							<span>本文已被取代 →</span>
							<a href={m.superseded_by}>{m.superseded_by}</a>
						</div>
					{/if}
					{#if m.folded_to}
						<div class="doc-banner doc-banner-folded">
							<span class="doc-banner-icon">📦</span>
							<span>本节内容已折叠到 →</span>
							<a href={m.folded_to}>{m.folded_to}</a>
						</div>
					{/if}
				</div>
			{/if}
			{@html data.html}
		</article>
		{#if data.headings && data.headings.length >= 2}
			<aside class="toc" aria-label="On this page">
				<div class="toc-title">本页目录</div>
				<ul class="toc-list">
					{#each data.headings as h}
						<li class="toc-item depth-{h.depth}" class:active={activeId === h.slug}>
							<a href={`#${h.slug}`}>{h.text}</a>
						</li>
					{/each}
				</ul>
			</aside>
		{/if}
	</div>
{/if}

<style>
	:global(html) { scroll-behavior: smooth; }
	:global(.doc-content :is(h1, h2, h3)) { scroll-margin-top: 20px; }

	.doc-meta {
		margin: 0 0 24px;
		padding: 16px 20px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-soft);
	}
	.doc-desc {
		margin: 0;
		color: var(--text);
		font-size: 15px;
		line-height: 1.55;
	}
	.doc-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
		font-size: 12px;
		color: var(--text-muted);
		font-family: var(--font-mono);
	}
	.doc-desc + .doc-chips { border-top: 1px dashed var(--border); padding-top: 10px; }
	.doc-chips .sep { opacity: 0.5; }

	.doc-banner {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 13px;
		line-height: 1.5;
	}
	.doc-banner-icon { font-size: 14px; }
	.doc-banner a {
		color: var(--brand);
		text-decoration: none;
		font-family: var(--font-mono);
		word-break: break-all;
	}
	.doc-banner a:hover { text-decoration: underline; }
	.doc-banner-superseded {
		background: color-mix(in srgb, var(--brand) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--border));
		color: var(--text);
		font-weight: 500;
	}
	.doc-banner-folded {
		background: var(--bg);
		border: 1px dashed var(--border);
		color: var(--text-muted);
	}
	.doc-banner-folded a { color: var(--text); }

	.pdf-frame {
		flex: 1;
		background: var(--bg-soft);
	}
	.pdf-frame iframe {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
	}

	.content-wrap {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.doc-content {
		flex: 1;
		min-width: 0;
		padding: 32px 48px 96px;
		overflow-y: auto;
	}

	.toc {
		display: none;
	}

	@media (min-width: 1280px) {
		.toc {
			display: block;
			width: auto; min-width: var(--toc-min-width, 200px); max-width: var(--toc-max-width, 380px);
			flex-shrink: 0;
			overflow-y: auto;
			padding: 32px 14px 32px 14px;
			border-left: 1px solid var(--border);
			font-size: 13px;
			line-height: 1.5;
		}
		.toc-title {
			font-size: 12px;
			font-weight: 600;
			letter-spacing: 0.04em;
			color: var(--text);
			margin-bottom: 10px;
			text-transform: uppercase;
		}
		.toc-list {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.toc-item a {
			display: block;
			padding: 4px 8px;
			color: var(--text-muted);
			text-decoration: none;
			border-left: 2px solid transparent;
			margin-left: -16px;
			transition: color 0.12s, border-color 0.12s;
		}
		.toc-item a:hover { color: var(--text); }
		.toc-item.active a {
			color: var(--brand);
			border-left-color: var(--brand);
			font-weight: 500;
		}
		.toc-item.depth-2 a { padding-left: var(--toc-indent, 16px); }
		.toc-item.depth-3 a { padding-left: calc(var(--toc-indent, 16px) * 2); font-size: 12px; }
	}

	@media (max-width: 768px) {
		.pdf-frame {
			flex: 1;
		}
		.doc-content {
			padding: 24px 16px 64px;
		}
	}

	:global(.mermaid-rendered) {
		position: relative;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-soft);
		margin: 16px 0;
		overflow: visible;
	}

	:global(.mermaid-viewport) {
		min-height: 200px;
		cursor: grab;
	}
	:global(.mermaid-viewport:active) {
		cursor: grabbing;
	}
	:global(.mermaid-viewport svg) {
		display: block;
	}
</style>
