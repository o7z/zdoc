<script lang="ts">
	import { page } from '$app/stores';

	let { container }: { container: HTMLElement } = $props();

	let visible = $state(false);
	let popupX = $state(0);
	let popupY = $state(0);
	let previewHtml = $state('');
	let previewTitle = $state('');
	let loading = $state(false);

	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let isOverPopup = false;
	let isOverLink = false;
	let currentAnchor = $state<string | null>(null);
	let currentPath: string | null = null;

	const cache = new Map<string, { title: string; html: string }>();

	function parseLink(href: string, base: string): { path: string; anchor: string } | null {
		try {
			const url = new URL(href, base);
			if (url.origin !== new URL(base).origin) return null;
			const pathname = url.pathname;
			if (!pathname.endsWith('.md')) return null;
			return { path: pathname.startsWith('/') ? pathname.slice(1) : pathname, anchor: url.hash.slice(1) };
		} catch {
			return null;
		}
	}

	function positionPopup(anchorEl: HTMLElement) {
		const rect = anchorEl.getBoundingClientRect();
		const gap = 8;
		const popupWidth = 480;
		const popupMaxHeight = 360;

		let x = rect.left;
		let y = rect.bottom + gap;

		if (x + popupWidth > window.innerWidth - 16) {
			x = window.innerWidth - popupWidth - 16;
		}
		if (x < 16) x = 16;

		if (y + popupMaxHeight > window.innerHeight - 16) {
			const aboveY = rect.top - gap - popupMaxHeight;
			if (aboveY > 16) {
				y = aboveY;
			}
		}

		popupX = x;
		popupY = y;
	}

	async function fetchPreview(path: string, anchor: string) {
		const cacheKey = `${path}#${anchor}`;
		if (cache.has(cacheKey)) {
			const cached = cache.get(cacheKey)!;
			previewTitle = cached.title;
			previewHtml = cached.html;
			return;
		}

		loading = true;
		try {
			const params = new URLSearchParams({ path });
			if (anchor) params.set('anchor', anchor);
			const res = await fetch(`/api/preview?${params}`);
			if (!res.ok) return;
			const data = await res.json();
			cache.set(cacheKey, { title: data.title, html: data.html });
			previewTitle = data.title;
			previewHtml = data.html;
		} catch {
			previewHtml = '';
		} finally {
			loading = false;
		}
	}

	function hide() {
		visible = false;
		previewHtml = '';
		previewTitle = '';
		currentAnchor = null;
		currentPath = null;
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleHide() {
		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (!isOverLink && !isOverPopup) hide();
		}, 1000);
	}

	function cancelHide() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	$effect(() => {
		$page.url.pathname;
		hide();
	});

	$effect(() => {
		if (!container) return;

		function onMouseOver(e: MouseEvent) {
			const anchor = (e.target as HTMLElement).closest('a');
			if (!anchor) return;
			if (!anchor.closest('.doc-content')) return;
			const href = anchor.getAttribute('href');
			if (!href) return;

			const parsed = parseLink(href, window.location.href);
			if (!parsed) return;

			isOverLink = true;
			cancelHide();
			currentPath = parsed.path;
			currentAnchor = parsed.anchor;

			if (hoverTimer) clearTimeout(hoverTimer);
			hoverTimer = setTimeout(async () => {
				if (!isOverLink) return;
				positionPopup(anchor as HTMLElement);
				visible = true;
				await fetchPreview(parsed.path, parsed.anchor);
			}, 200);
		}

		function onMouseOut(e: MouseEvent) {
			const anchor = (e.target as HTMLElement).closest('a');
			if (!anchor) return;
			if (!anchor.closest('.doc-content')) return;
			isOverLink = false;
			if (hoverTimer) {
				clearTimeout(hoverTimer);
				hoverTimer = null;
			}
			scheduleHide();
		}

		container.addEventListener('mouseover', onMouseOver);
		container.addEventListener('mouseout', onMouseOut);

		return () => {
			container.removeEventListener('mouseover', onMouseOver);
			container.removeEventListener('mouseout', onMouseOut);
			if (hoverTimer) clearTimeout(hoverTimer);
			if (hideTimer) clearTimeout(hideTimer);
		};
	});
</script>

{#if visible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="link-preview-popup"
		style="left:{popupX}px;top:{popupY}px"
		onmouseenter={() => { isOverPopup = true; cancelHide(); }}
		onmouseleave={() => { isOverPopup = false; scheduleHide(); }}
	>
		<div class="link-preview-header">
			<span class="link-preview-title">{previewTitle}</span>
			{#if currentAnchor}
				<code class="link-preview-anchor">#{currentAnchor}</code>
			{/if}
		</div>
		<div class="link-preview-body">
			{#if loading}
				<div class="link-preview-loading">加载中…</div>
			{:else if previewHtml}
				<div class="doc-content">{@html previewHtml}</div>
			{:else}
				<div class="link-preview-empty">无法预览</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.link-preview-popup {
		position: fixed;
		z-index: 300;
		width: 480px;
		max-width: calc(100vw - 32px);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
		overflow: hidden;
		pointer-events: auto;
	}

	.link-preview-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-soft);
		font-size: 13px;
	}

	.link-preview-title {
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.link-preview-anchor {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--brand);
		background: var(--brand-soft);
		padding: 1px 6px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.link-preview-body {
		max-height: 320px;
		overflow-y: auto;
		padding: 12px 16px;
		font-size: 14px;
		line-height: 1.6;
	}

	.link-preview-body :global(h1),
	.link-preview-body :global(h2),
	.link-preview-body :global(h3) {
		font-size: 1em;
		margin: 0 0 8px;
		padding: 0;
		border: none;
	}

	.link-preview-body :global(h1) { font-size: 1.1em; }
	.link-preview-body :global(h2) { font-size: 1.05em; }

	.link-preview-body :global(pre) {
		font-size: 12px;
		padding: 10px 12px;
	}

	.link-preview-body :global(.code-copy) {
		display: none;
	}

	.link-preview-loading,
	.link-preview-empty {
		text-align: center;
		color: var(--text-muted);
		padding: 24px 0;
		font-size: 13px;
	}
</style>
