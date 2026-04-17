<script>
	import { onMount, onDestroy } from 'svelte';

	let { data } = $props();
	let activeId = $state('');

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

		const offset = 100;

		function update() {
			let current = headings[0].slug;
			for (const h of headings) {
				const el = document.getElementById(h.slug);
				if (!el) continue;
				if (el.getBoundingClientRect().top < offset) current = h.slug;
				else break;
			}
			activeId = current;
		}

		update();
		window.addEventListener('scroll', update, { passive: true });
		cleanupSpy = () => window.removeEventListener('scroll', update);
	}

	async function initMermaid() {
		const blocks = document.querySelectorAll('pre.mermaid');
		if (blocks.length === 0) return;

		const mermaid = (await import('mermaid')).default;
		mermaid.initialize({
			startOnLoad: false,
			theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
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

{#if data.kind === 'pdf'}
	<div class="pdf-frame">
		<iframe src={data.pdfUrl} title={data.title}></iframe>
	</div>
{:else}
	<article class="doc-content">
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
{/if}

<style>
	:global(html) { scroll-padding-top: 70px; scroll-behavior: smooth; }
	:global(.doc-content :is(h1, h2, h3)) { scroll-margin-top: 70px; }

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
		position: absolute;
		inset: 49px 0 0 280px;
		background: var(--bg-soft);
	}
	.pdf-frame iframe {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
	}

	.toc {
		display: none;
	}

	@media (min-width: 1280px) {
		.toc {
			display: block;
			position: fixed;
			top: 70px;
			right: 24px;
			width: 220px;
			max-height: calc(100vh - 90px);
			overflow-y: auto;
			padding-left: 14px;
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
			inset: 49px 0 0 0;
		}
	}
</style>
