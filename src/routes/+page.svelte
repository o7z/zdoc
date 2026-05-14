<script>
	import { onMount } from 'svelte';
	let { data } = $props();

	onMount(() => {
		initMermaid();
	});

	$effect(() => {
		data.html;
		if (typeof window !== 'undefined') {
			requestAnimationFrame(() => {
				initMermaid();
			});
		}
	});

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
		if (typeof window === 'undefined') return;
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

<div class="content-wrap">
	{#if data.hero}
		<div class="hero">
			<h1 class="hero-name">{data.hero.name}</h1>
			<p class="hero-text">{data.hero.text}</p>
			{#if data.hero.tagline}
				<p class="hero-tagline">{data.hero.tagline}</p>
			{/if}
			{#if data.hero.actions.length > 0}
				<div class="hero-actions">
					{#each data.hero.actions as action}
						<a href={action.link} class="hero-btn" class:brand={action.theme === 'brand'}>{action.text}</a>
					{/each}
				</div>
			{/if}
		</div>

		{#if data.hero.features.length > 0}
			<div class="features">
				{#each data.hero.features as feature}
					<div class="feature-card">
						<h3>{feature.title}</h3>
						<p>{feature.details}</p>
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	{#if data.html}
		<div class="page-body">
			<article class="doc-content">
				{@html data.html}
			</article>
		</div>
	{/if}
</div>

<style>
	.content-wrap {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.hero {
		text-align: center;
		padding: 64px 24px 48px;
	}
	.hero-name {
		font-size: 3.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		background: linear-gradient(135deg, var(--brand) 0%, #818cf8 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 8px;
	}
	.hero-text {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 8px;
	}
	.hero-tagline {
		font-size: 1.1rem;
		color: var(--text-muted);
		max-width: 480px;
		margin: 0 auto 32px;
		line-height: 1.6;
	}
	.hero-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	.hero-btn {
		padding: 12px 28px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.2s;
		border: 1px solid var(--border);
		color: var(--text);
		background: var(--bg);
	}
	.hero-btn.brand {
		background: var(--brand);
		color: white;
		border-color: var(--brand);
	}
	.hero-btn.brand:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}
	.hero-btn:not(.brand):hover {
		border-color: var(--brand);
		color: var(--brand);
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 20px;
		padding: 0 24px 64px;
		max-width: 800px;
		margin: 0 auto;
	}
	.feature-card {
		padding: 24px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-soft);
		transition: border-color 0.2s;
	}
	.feature-card:hover {
		border-color: var(--brand);
	}
	.feature-card h3 {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 8px;
		color: var(--text);
	}
	.feature-card p {
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.page-body {
		padding: 32px 48px 96px;
		max-width: 900px;
		margin: 0 auto;
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

	:global(.mermaid-viewer-control-panel) {
		display: flex;
		gap: 4px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
	}
	:global(.mvcp-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-muted);
		transition: color 0.12s, background 0.12s;
	}
	:global(.mvcp-btn:hover) {
		color: var(--text);
		background: var(--bg-hover, rgba(128,128,128,0.1));
	}
	:global(.mvcp-btn svg) {
		width: 18px;
		height: 18px;
	}
</style>
