<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import LinkPreview from '$lib/LinkPreview.svelte';
	import { ExternalLink, Package } from 'lucide-svelte';
	import { fuzzyScore, highlight, quickReject, snippet } from '$lib/fuzzy.js';
	import '../app.css';

	function autofocus(node) { node.focus(); }

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let darkMode = $state(false);
	let searchDialogEl = $state(null);
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let debouncedQuery = $state('');
	let activeIdx = $state(0);
	let aboutDialogEl = $state(null);
	let mainEl = $state(null);
	/** @type {Set<string>} */
	let collapsedGroups = $state(new Set());

	// Flatten sidebar once
	let flatItems = $derived.by(() => {
		if (!data?.sidebar) return [];
		return flattenSidebar(data.sidebar);
	});

	let titleResults = $derived.by(() => {
		const q = debouncedQuery.trim();
		if (!q) return [];
		const scored = [];
		for (const item of flatItems) {
			if (quickReject(item.text, q) && quickReject(item.link, q)) continue;
			const titleMatch = quickReject(item.text, q) ? null : fuzzyScore(item.text, q);
			const linkMatch = quickReject(item.link, q) ? null : fuzzyScore(item.link, q);
			if (!titleMatch && !linkMatch) continue;
			const titleScore = titleMatch ? titleMatch.score : -Infinity;
			const linkScore = linkMatch ? linkMatch.score - 5 : -Infinity;
			const score = titleScore >= linkScore ? titleScore : linkScore;
			scored.push({
				kind: 'title',
				text: item.text,
				link: item.link,
				score,
				titleHTML: highlight(item.text, titleMatch?.indices ?? null),
				pathHTML: highlight(item.link, linkMatch?.indices ?? null)
			});
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, 12);
	});

	let contentResults = $derived.by(() => {
		const q = debouncedQuery.trim();
		if (!q) return [];
		const idx = data?.searchIndex;
		if (!idx || !idx.length) return [];
		const scored = [];
		for (const entry of idx) {
			const headingReject = quickReject(entry.heading, q);
			const contentReject = quickReject(entry.content, q);
			if (headingReject && contentReject) continue;
			const headingMatch = headingReject ? null : fuzzyScore(entry.heading, q);
			const contentMatch = contentReject ? null : fuzzyScore(entry.content, q);
			if (!headingMatch && !contentMatch) continue;
			// +5: heading hits outrank body hits at the same fuzzy score so navigation-style queries surface section landmarks first.
			const headingScore = headingMatch ? headingMatch.score + 5 : -Infinity;
			const contentScore = contentMatch ? contentMatch.score : -Infinity;
			const score = headingScore >= contentScore ? headingScore : contentScore;
			scored.push({
				kind: 'content',
				link: entry.link,
				pageTitle: entry.pageTitle,
				heading: entry.heading,
				score,
				headingHTML: headingMatch
					? highlight(entry.heading, headingMatch.indices)
					: highlight(entry.heading, null),
				snippetHTML: contentMatch
					? snippet(entry.content, contentMatch.indices, 60)
					: snippet(entry.content, null, 60)
			});
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, 12);
	});

	let allResults = $derived([...titleResults, ...contentResults]);

	// Reset activeIdx when query changes
	$effect(() => {
		debouncedQuery;
		activeIdx = 0;
	});

	// Debounce searchQuery -> debouncedQuery (150ms)
	$effect(() => {
		const q = searchQuery;
		const id = setTimeout(() => {
			debouncedQuery = q;
		}, 150);
		return () => clearTimeout(id);
	});

	// Scroll active item into view
	$effect(() => {
		activeIdx;
		if (!searchDialogEl) return;
		const active = searchDialogEl.querySelector('.search-result.active');
		active?.scrollIntoView({ block: 'nearest' });
	});

	function flattenSidebar(groups) {
		const result = [];
		for (const g of groups) {
			if (g.link) {
				result.push({ text: g.text, link: g.link });
			} else if (g.items?.length) {
				const firstLink = findFirstLink(g);
				if (firstLink) result.push({ text: g.text, link: firstLink });
			}
			if (g.items) result.push(...flattenSidebar(g.items));
		}
		return result;
	}

	function findFirstLink(group) {
		if (group.link) return group.link;
		if (!group.items) return null;
		for (const child of group.items) {
			const found = findFirstLink(child);
			if (found) return found;
		}
		return null;
	}

	function toggleDark() {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
		localStorage.setItem('docs-dark', darkMode ? '1' : '0');
	}

	function openSearch() {
		searchOpen = true;
		searchQuery = '';
		debouncedQuery = '';
		activeIdx = 0;
		tick().then(() => searchDialogEl?.showModal());
	}

	function closeSearch() {
		searchOpen = false;
		searchDialogEl?.close();
	}

	function navigateToResult(link) {
		closeSearch();
		goto(link);
	}

	function handleSearchKeydown(e) {
		const len = allResults.length;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIdx = len > 0 ? (activeIdx + 1) % len : 0;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIdx = len > 0 ? (activeIdx - 1 + len) % len : 0;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (len > 0 && activeIdx >= 0 && activeIdx < len) {
				navigateToResult(allResults[activeIdx].link);
			}
		}
	}

	$effect(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('docs-dark');
			const isDark = saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
			darkMode = isDark;
			document.documentElement.classList.toggle('dark', isDark);
			const handler = (e) => {
				if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
					e.preventDefault();
					openSearch();
				}
			};
			window.addEventListener('keydown', handler);
			return () => window.removeEventListener('keydown', handler);
		}
	});

	// Close sidebar on navigation
	$effect(() => {
		$page.url.pathname;
		sidebarOpen = false;
	});

	// Code block copy
	$effect(() => {
		if (typeof window === 'undefined') return;
		const handler = (e) => {
			const btn = e.target.closest('.code-copy');
			if (!btn) return;
			const block = btn.closest('.code-block');
			const code = block?.querySelector('code');
			if (!code) return;
			const text = code.textContent || '';
			const copyText = text.endsWith('\n') ? text : text + '\n';
			navigator.clipboard.writeText(copyText).then(() => {
				btn.classList.add('copied');
				setTimeout(() => {
					btn.classList.remove('copied');
				}, 2000);
			});
		};
		document.addEventListener('click', handler);
		return () => document.removeEventListener('click', handler);
	});
</script>

<div class="layout">
	<header>
		<button class="menu-toggle" onclick={() => sidebarOpen = !sidebarOpen} aria-label="Toggle menu">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			</svg>
		</button>
		<a href="/" class="logo">{data.siteTitle}</a>
		<button class="search-trigger" onclick={openSearch}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
			<span>搜索</span>
			<kbd>Ctrl+K</kbd>
		</button>
		<div class="header-actions">
			<button class="icon-btn" onclick={toggleDark} aria-label="Toggle dark mode">
				{#if darkMode}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
				{/if}
			</button>
			<button class="icon-btn" onclick={() => aboutDialogEl?.showModal()} aria-label="About zdoc">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
			</button>
		</div>
	</header>

	<div class="body">
		<nav class="sidebar" class:open={sidebarOpen}>
			<div class="sidebar-scroll">
				{#each data.sidebar as group}
					{@render sidebarGroup(group, 0)}
				{/each}
			</div>
		</nav>
		<main bind:this={mainEl}>
			{#key $page.url.pathname}
				{@render children()}
			{/key}
		</main>
	</div>
</div>

{#if mainEl}
	<LinkPreview container={mainEl} />
{/if}

<dialog class="about-dialog" bind:this={aboutDialogEl} onclick={(e) => { if (e.target === aboutDialogEl) aboutDialogEl.close(); }}>
		<div class="about-content">
			<button class="about-close" onclick={() => aboutDialogEl.close()} aria-label="Close">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
			</button>
			<div class="about-body">
				<div class="about-logo">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
				</div>
				<h2 class="about-title">zdoc</h2>
				<p class="about-desc">Zero-config Markdown docs site</p>
				<div class="about-links">
					<a href="https://github.com/o7z/zdoc" target="_blank" rel="noopener" class="about-link">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
						<span>GitHub</span>
					</a>
					<a href="https://www.npmjs.com/package/@o7z/zdoc" target="_blank" rel="noopener" class="about-link">
						<Package size={16} />
						<span>npm</span>
					</a>
					<a href="https://context7.com/o7z/zdoc" target="_blank" rel="noopener" class="about-link">
						<ExternalLink size={16} />
						<span>Context7</span>
					</a>
				</div>
			</div>
		</div>
	</dialog>

<!-- Search modal -->
<dialog class="search-dialog" bind:this={searchDialogEl} onclose={() => { searchOpen = false; searchQuery = ''; debouncedQuery = ''; activeIdx = 0; }}>
	<div class="search-modal">
		<div class="search-input-row">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
			<input
				type="text"
				placeholder="搜索文档..."
				bind:value={searchQuery}
				onkeydown={handleSearchKeydown}
				use:autofocus
			>
			<button class="search-close" onclick={closeSearch}>
				<kbd>Esc</kbd>
			</button>
		</div>
		{#if allResults.length > 0}
			<div class="search-results">
				{#if titleResults.length > 0}
					<div class="result-group-label">标题</div>
					{#each titleResults as result, i}
						<button
							class="search-result"
							class:active={i === activeIdx}
							onclick={() => navigateToResult(result.link)}
							onmouseenter={() => activeIdx = i}
						>
							<span class="result-title">{@html result.titleHTML}</span>
							<span class="result-path">{@html result.pathHTML}</span>
						</button>
					{/each}
				{/if}
				{#if contentResults.length > 0}
					<div class="result-group-label">正文</div>
					{#each contentResults as result, j}
						{@const idx = titleResults.length + j}
						<button
							class="search-result content"
							class:active={idx === activeIdx}
							onclick={() => navigateToResult(result.link)}
							onmouseenter={() => activeIdx = idx}
						>
							<span class="result-title">
								{@html result.headingHTML}
								<span class="result-page">— {result.pageTitle}</span>
							</span>
							<span class="result-snippet">{@html result.snippetHTML}</span>
						</button>
					{/each}
				{/if}
			</div>
		{:else if debouncedQuery.trim().length > 0}
			<div class="search-empty">没有找到结果</div>
		{/if}
		<div class="search-footer">
			<span><kbd>Enter</kbd> 选择</span>
			<span><kbd>Esc</kbd> 关闭</span>
		</div>
	</div>
</dialog>

{#snippet sidebarGroup(group, depth)}
	{#if group.items && group.items.length > 0}
		{@const isCollapsed = collapsedGroups.has(group.text)}
		<div class="sidebar-group" class:nested={depth > 0}>
			<button
				class="group-toggle"
				onclick={() => {
					const next = new Set(collapsedGroups);
					if (next.has(group.text)) next.delete(group.text);
					else next.add(group.text);
					collapsedGroups = next;
				}}
			>
				<svg class="chevron" class:collapsed={isCollapsed} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
				<span>{group.text}</span>
			</button>
			{#if !isCollapsed}
				<div class="group-items">
					{#each group.items as child}
						{@render sidebarGroup(child, depth + 1)}
					{/each}
				</div>
			{/if}
		</div>
	{:else if group.link}
		<a href={group.link} class="sidebar-link" class:active={$page.url.pathname === group.link} class:nested={depth > 0}>
			{group.text}
		</a>
	{:else}
		<span class="sidebar-label">{group.text}</span>
	{/if}
{/snippet}

<style>
	* { box-sizing: border-box; }
	body { margin: 0; font-family: var(--font-sans); background: var(--bg); color: var(--text); }
	:global(.doc-content p, .doc-content li) { font-size: 16px; line-height: 1.8; }
	:global(.doc-content a) { color: var(--brand); text-decoration: none; }
	:global(.doc-content a:hover) { text-decoration: underline; }

	/* Layout */
	.layout { display: flex; flex-direction: column; height: 100%; }
	header { display: flex; align-items: center; gap: 8px; padding: 0 16px; height: 56px; border-bottom: 1px solid var(--border); background: var(--bg); flex-shrink: 0; z-index: 10; }
	.menu-toggle { display: none; padding: 8px; border: none; background: none; color: var(--text); cursor: pointer; }
	.logo { font-weight: 700; font-size: 18px; color: var(--text); text-decoration: none; }
	.search-trigger { display: flex; align-items: center; gap: 8px; margin-left: auto; margin-right: 8px; padding: 7px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-soft); color: var(--text-muted); cursor: pointer; font-size: 13px; min-width: 240px; transition: border-color 0.15s, color 0.15s; }
	.search-trigger:hover { border-color: var(--brand); color: var(--text); }
	.search-trigger kbd { font-family: var(--font-mono); margin-left: auto; font-size: 11px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; color: var(--text-muted); }
	.header-actions { display: flex; gap: 8px; align-items: center; }
	.icon-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; color: var(--text-muted); cursor: pointer; border-radius: 6px; }
	.icon-btn:hover { background: var(--bg-soft); color: var(--text); }
	.body { display: flex; flex: 1; min-height: 0; overflow: hidden; }
	.sidebar { width: 240px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; padding: 24px 16px 32px; display: flex; flex-direction: column; gap: 8px; }
	main { flex: 1; display: flex; min-width: 0; overflow: hidden; }
	
	/* Sidebar */
	.sidebar-group { margin-bottom: -4px; }
	.group-toggle { display: flex; align-items: center; gap: 4px; width: 100%; padding: 6px 8px; border: none; background: none; color: var(--text); font-weight: 600; cursor: pointer; text-align: left; font-size: 14px; border-radius: 4px; }
	.group-toggle:hover { background: var(--bg-soft); }
	.group-toggle.nested { font-weight: 500; font-size: 13px; padding-left: 20px; }
	.chevron { transition: transform 0.2s; }
	.chevron.collapsed { transform: rotate(-90deg); }
	.group-items { padding-left: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
	.group-items > .nested { padding-left: 20px; }
	.sidebar-link { display: block; padding: 6px 8px; border-radius: 4px; text-decoration: none; color: var(--text); font-size: 14px; line-height: 1.5; }
	.sidebar-link:hover { background: var(--bg-soft); }
	.sidebar-link.active { color: var(--brand); background: var(--brand-soft); font-weight: 500; }
	.sidebar-link.nested { padding-left: 20px; }
	.sidebar-label { display: block; padding: 6px 8px; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
	.sidebar-scroll { flex: 1; }
	
	/* About dialog */
	.about-dialog { border: none; background: var(--bg); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); padding: 24px; color: var(--text); width: 280px; max-width: 90vw; margin: auto; }
	.about-dialog::backdrop { background: rgba(0,0,0,0.5); }
	.about-content { position: relative; }
	.about-close { position: absolute; top: 0; right: 0; background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px; border-radius: 4px; }
	.about-close:hover { background: var(--bg-soft); color: var(--text); }
	.about-body { text-align: center; }
	.about-logo { margin-bottom: 12px; }
	.about-title { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
	.about-desc { font-size: 13px; color: var(--text-muted); margin: 0 0 4px; }
	.about-links { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 180px; margin: 0 auto; }
	.about-links a, .about-link { width: 100%; padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; color: var(--text-muted); text-decoration: none; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
	.about-links a:hover, .about-link:hover { color: var(--brand); border-color: var(--brand); background: var(--brand-soft); }

	/* Search modal */
	.search-dialog { border: none; background: transparent; position: fixed; top: 15vh; left: 50%; transform: translateX(-50%); width: 560px; max-width: 90vw; max-height: 70vh; padding: 0; margin: 0; z-index: 200; color: var(--text); border-radius: 12px; overflow: hidden; }
	.search-dialog::backdrop { background: rgba(0,0,0,0.5); }
	.search-modal { display: flex; flex-direction: column; background: var(--bg); height: 100%; }
	.search-input-row { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.search-input-row input { flex: 1; border: none; background: none; font-size: 16px; color: var(--text); outline: none; font-family: var(--font-sans); }
	.search-close { background: none; border: none; cursor: pointer; color: var(--text-muted); }
	.search-close kbd { padding: 2px 8px; background: var(--bg-soft); border: 1px solid var(--border); border-radius: 4px; font-size: 12px; font-family: var(--font-mono); color: var(--text-muted); }
	.search-results { max-height: 100%; overflow-y: auto; padding: 8px; }
	.search-result { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 10px 12px; border: none; background: none; border-radius: 8px; cursor: pointer; text-align: left; color: var(--text); }
	.search-result:hover, .search-result.active { background: var(--brand-soft); }
	.search-result.active { border: 1px solid var(--brand); }
	.result-title { font-size: 14px; font-weight: 500; }
	.result-path { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
	.search-empty { padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 14px; }
	.search-footer { display: flex; gap: 16px; padding: 10px 20px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }
	.search-footer kbd { padding: 1px 5px; background: var(--bg-soft); border: 1px solid var(--border); border-radius: 3px; font-size: 11px; font-family: var(--font-mono); }
	.search-result :global(mark.highlight) { background: var(--brand-soft); color: var(--brand); padding: 0 2px; border-radius: 2px; }
	.result-group-label { padding: 8px 12px 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
	.result-page { color: var(--text-muted); font-weight: 400; font-size: 12px; margin-left: 4px; }
	.result-snippet { font-size: 12px; color: var(--text-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.search-result.content .result-title { font-weight: 500; }

	@media (max-width: 768px) {
		.menu-toggle { display: flex; }
		.search-trigger span, .search-trigger kbd { display: none; }
		.search-trigger { min-width: auto; padding: 8px; }
		.sidebar { position: fixed; left: -360px; top: 0; z-index: 99; transition: left 0.2s; height: 100vh; width: 300px; max-width: 80vw; box-shadow: 2px 0 8px rgba(0,0,0,0.1); }
		.sidebar.open { left: 0; }
	}
</style>
