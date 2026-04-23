<script>
	import { onMount, onDestroy } from 'svelte';

	let { data } = $props();
	let activeId = $state('');
	let mainEl = $state(null);

	/** @type {() => void} */
	let cleanupSpy = () => {};

	onMount(() => {
		if (data.kind === 'md') initMermaid();
		setupScrollSpy();
	});

	$effect(() => {
		data.html;
		if (typeof window !== 'undefined' && data.kind === 'md') {
			requestAnimationFrame(() => {
				initMermaid();
				setupScrollSpy();
			});
		}
	});

	onDestroy(() => cleanupSpy());

	function setupScrollSpy() {
		cleanupSpy();
		if (data.kind !== 'md') return;
		const headings = data.headings ?? [];
		if (headings.length < 2) return;

		const container = mainEl;
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

	async function initMermaid() {
		const blocks = document.querySelectorAll('pre.mermaid');
		if (blocks.length === 0) return;

		const mermaid = (await import('mermaid')).default;
		mermaid.initialize({
			startOnLoad: false,
			theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
			securityLevel: 'loose',
		});

		for (const block of blocks) {
			if (block.dataset.rendered) continue;
			block.dataset.rendered = 'true';

			const code = block.textContent || '';
			const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
			try {
				const { svg } = await mermaid.render(id, code);
				const container = document.createElement('div');
				container.className = 'mermaid-rendered';
				container.innerHTML = svg;
				
				const svgEl = container.querySelector('svg');
				if (svgEl) {
					const viewBox = svgEl.getAttribute('viewBox');
					if (viewBox) {
						const parts = viewBox.split(/\s+/);
						const vbHeight = parseFloat(parts[3]);
						svgEl.setAttribute('height', String(vbHeight));
					}
				}
				
				block.replaceWith(container);
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
				{@const chips = [m.version && `v${m.version}`, m.modified, m.author].filter(Boolean)}
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
			width: 220px;
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
		.toc-item.depth-2 a { padding-left: 20px; }
		.toc-item.depth-3 a { padding-left: 32px; font-size: 12px; }
	}

	@media (max-width: 768px) {
		.pdf-frame {
			flex: 1;
		}
		.doc-content {
			padding: 24px 16px 64px;
		}
	}
</style>
