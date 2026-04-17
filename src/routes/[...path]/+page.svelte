<script>
	import { onMount } from 'svelte';

	let { data } = $props();

	onMount(() => {
		if (data.kind === 'md') initMermaid();
	});

	$effect(() => {
		data.html;
		if (typeof window !== 'undefined' && data.kind === 'md') {
			requestAnimationFrame(() => initMermaid());
		}
	});

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

{#if data.kind === 'pdf'}
	<div class="pdf-frame">
		<iframe src={data.pdfUrl} title={data.title}></iframe>
	</div>
{:else}
	<article class="doc-content">
		{@html data.html}
	</article>
{/if}

<style>
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
	@media (max-width: 768px) {
		.pdf-frame {
			inset: 49px 0 0 0;
		}
	}
</style>
