<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import LinkPreview from '$lib/LinkPreview.svelte';
	import '../app.css';

	function autofocus(node) { node.focus(); }

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let darkMode = $state(false);
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let aboutDialogEl = $state(null);
	let mainEl = $state(null);
	/** @type {Set<string>} */
	let collapsedGroups = $state(new Set());
	let searchResults = $derived.by(() => {
		if (!searchQuery || searchQuery.length < 2) return [];
		const q = searchQuery.toLowerCase();
		return flattenSidebar(data.sidebar)
			.filter((item) => item.text.toLowerCase().includes(q) || item.link.toLowerCase().includes(q))
			.slice(0, 12);
	});

	function flattenSidebar(groups) {
		const result = [];
		for (const g of groups) {
			if (g.link) result.push({ text: g.text, link: g.link });
			if (g.items) result.push(...flattenSidebar(g.items));
		}
		return result;
	}

	function toggleDark() {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
		localStorage.setItem('docs-dark', darkMode ? '1' : '0');
	}

	function openSearch() {
		searchOpen = true;
		searchQuery = '';
	}

	function closeSearch() {
		searchOpen = false;
		searchQuery = '';
	}

	function navigateToResult(link) {
		closeSearch();
		goto(link);
	}

	function handleSearchKeydown(e) {
		if (e.key === 'Escape') closeSearch();
		if (e.key === 'Enter' && searchResults.length > 0) {
			navigateToResult(searchResults[0].link);
		}
	}

	$effect(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('docs-dark');
			const isDark = saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
			darkMode = isDark;
			document.documentElement.classList.toggle('dark', isDark);
			// Ctrl+K / Cmd+K to open search
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
			{#if data.version}
				<div class="sidebar-footer">
					{#if data.repoUrl}
						<a href={data.repoUrl} target="_blank" rel="noopener">v{data.version}</a>
					{:else}
						<span>v{data.version}</span>
					{/if}
				</div>
			{/if}
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
				{#if data.version}
					<div class="about-version">v{data.version}</div>
				{/if}
				<div class="about-links">
					{#if data.repoUrl}
						<a href={data.repoUrl} target="_blank" rel="noopener">GitHub</a>
					{/if}
					<a href="https://www.npmjs.com/package/@o7z/zdoc" target="_blank" rel="noopener">npm</a>
					<a href="https://context7.com/o7z/zdoc" target="_blank" rel="noopener">Context7</a>
				</div>
			</div>
		</div>
	</dialog>

<!-- Search modal -->
{#if searchOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="search-overlay" onclick={closeSearch} onkeydown={handleSearchKeydown}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="search-modal" onclick={(e) => e.stopPropagation()}>
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
			{#if searchResults.length > 0}
				<div class="search-results">
					{#each searchResults as result}
						<button class="search-result" onclick={() => navigateToResult(result.link)}>
							<span class="result-title">{result.text}</span>
							<span class="result-path">{result.link}</span>
						</button>
					{/each}
				</div>
			{:else if searchQuery.length >= 2}
				<div class="search-empty">没有找到结果</div>
			{/if}
			<div class="search-footer">
				<span><kbd>Enter</kbd> 选择</span>
				<span><kbd>Esc</kbd> 关闭</span>
			</div>
		</div>
	</div>
{/if}

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
	.layout { display: flex; flex-direction: column; height: 100%; }

	header {
		display: flex; align-items: center; gap: 12px;
		padding: 12px 24px; border-bottom: 1px solid var(--border);
		background: var(--bg); flex-shrink: 0; z-index: 100;
	}
	.logo { font-weight: 700; font-size: 18px; color: var(--text); text-decoration: none; }
	.header-actions { display: flex; gap: 8px; }

	.search-trigger {
		display: flex; align-items: center; gap: 8px;
		margin-left: auto; margin-right: 8px;
		padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px;
		background: var(--bg-soft); color: var(--text-muted); cursor: pointer;
		font-size: 14px; min-width: 240px; transition: all 0.15s;
	}
	.search-trigger:hover { border-color: var(--brand); color: var(--text); }
	.search-trigger kbd {
		margin-left: auto; padding: 2px 6px;
		background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
		font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);
	}

	.icon-btn {
		background: none; border: 1px solid var(--border); border-radius: 6px;
		padding: 6px; cursor: pointer; color: var(--text-muted); display: flex;
		align-items: center; justify-content: center;
	}
	.icon-btn:hover { background: var(--bg-soft); color: var(--text); }
	.menu-toggle { display: none; background: none; border: none; cursor: pointer; color: var(--text); padding: 4px; }

	.body { display: flex; flex: 1; min-height: 0; overflow: hidden; }

	.sidebar {
		width: 280px; min-width: 240px; max-width: 360px; padding: 16px 0 0;
		border-right: 1px solid var(--border); overflow-y: auto;
		background: var(--bg); flex-shrink: 0;
		display: flex; flex-direction: column;
	}
	.sidebar-scroll { flex: 1; overflow-y: auto; }
	.sidebar-footer {
		padding: 12px 24px; border-top: 1px solid var(--border);
		font-size: 11px; color: var(--text-muted); flex-shrink: 0;
	}
	.sidebar-footer a {
		color: var(--text-muted); text-decoration: none; font-family: var(--font-mono);
	}
	.sidebar-footer a:hover { color: var(--brand); }
	.sidebar-footer span { font-family: var(--font-mono); }
	.sidebar-group { margin-bottom: 4px; }
	.sidebar-group.nested { margin-left: 12px; }
	.group-toggle {
		display: flex; align-items: center; gap: 4px; width: 100%;
		padding: 8px 24px; border: none; background: none; cursor: pointer;
		font-weight: 600; font-size: 13px; color: var(--text);
		letter-spacing: 0.02em; text-align: left; font-family: inherit;
	}
	.group-toggle:hover { color: var(--brand); }
	.chevron { transition: transform 0.15s; flex-shrink: 0; }
	.chevron.collapsed { transform: rotate(-90deg); }
	.group-items { margin-bottom: 8px; }
	.sidebar-link {
		display: block; padding: 6px 24px 6px 36px; font-size: 14px;
		color: var(--text-muted); text-decoration: none; border-left: 2px solid transparent;
		transition: all 0.15s;
	}
	.sidebar-link.nested { padding-left: 48px; }
	.sidebar-link:hover { color: var(--text); background: var(--bg-soft); }
	.sidebar-link.active {
		color: var(--brand); border-left-color: var(--brand);
		background: var(--brand-soft); font-weight: 500;
	}

	main { flex: 1; display: flex; min-width: 0; overflow: hidden; }

	/* About dialog */
	.about-dialog {
		border: none; padding: 0; margin: auto;
		width: 320px; max-width: 90vw;
		background: transparent;
	}
	.about-dialog::backdrop {
		background: rgba(0,0,0,0.5);
	}
	.about-content {
		background: var(--bg); border: 1px solid var(--border);
		border-radius: 12px; width: 100%;
		box-shadow: 0 16px 48px rgba(0,0,0,0.2);
		position: relative; padding: 32px 24px 24px;
	}
	.about-close {
		position: absolute; top: 12px; right: 12px;
		background: none; border: none; cursor: pointer;
		color: var(--text-muted); padding: 4px; display: flex;
	}
	.about-close:hover { color: var(--text); }
	.about-body { text-align: center; }
	.about-logo { margin-bottom: 12px; }
	.about-title {
		font-size: 20px; font-weight: 700; color: var(--text);
		margin: 0 0 4px;
	}
	.about-desc {
		font-size: 14px; color: var(--text-muted); margin: 0 0 16px;
	}
	.about-version {
		display: inline-block; padding: 4px 12px;
		background: var(--bg-soft); border: 1px solid var(--border);
		border-radius: 6px; font-size: 13px; font-family: var(--font-mono);
		color: var(--text-muted); margin-bottom: 16px;
	}
	.about-links {
		display: flex; gap: 12px; justify-content: center;
	}
	.about-links a {
		padding: 6px 16px; border: 1px solid var(--border); border-radius: 6px;
		font-size: 13px; color: var(--text-muted); text-decoration: none;
		transition: all 0.15s;
	}
	.about-links a:hover {
		color: var(--brand); border-color: var(--brand); background: var(--brand-soft);
	}

	/* Search modal */
	.search-overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.5);
		z-index: 200; display: flex; align-items: flex-start; justify-content: center;
		padding-top: 15vh;
	}
	.search-modal {
		background: var(--bg); border: 1px solid var(--border);
		border-radius: 12px; width: 560px; max-width: 90vw;
		box-shadow: 0 16px 48px rgba(0,0,0,0.2); overflow: hidden;
	}
	.search-input-row {
		display: flex; align-items: center; gap: 12px;
		padding: 16px 20px; border-bottom: 1px solid var(--border);
	}
	.search-input-row input {
		flex: 1; border: none; background: none; font-size: 16px;
		color: var(--text); outline: none; font-family: var(--font-sans);
	}
	.search-close {
		background: none; border: none; cursor: pointer; color: var(--text-muted);
	}
	.search-close kbd {
		padding: 2px 8px; background: var(--bg-soft); border: 1px solid var(--border);
		border-radius: 4px; font-size: 12px; font-family: var(--font-mono);
		color: var(--text-muted);
	}
	.search-results { max-height: 50vh; overflow-y: auto; padding: 8px; }
	.search-result {
		display: flex; flex-direction: column; gap: 2px; width: 100%;
		padding: 10px 12px; border: none; background: none; border-radius: 8px;
		cursor: pointer; text-align: left; color: var(--text);
	}
	.search-result:hover { background: var(--brand-soft); }
	.result-title { font-size: 14px; font-weight: 500; }
	.result-path { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
	.search-empty { padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 14px; }
	.search-footer {
		display: flex; gap: 16px; padding: 10px 20px;
		border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted);
	}
	.search-footer kbd {
		padding: 1px 5px; background: var(--bg-soft); border: 1px solid var(--border);
		border-radius: 3px; font-size: 11px; font-family: var(--font-mono);
	}

	@media (max-width: 768px) {
		.menu-toggle { display: flex; }
		.search-trigger span, .search-trigger kbd { display: none; }
		.search-trigger { min-width: auto; padding: 8px; }
		.sidebar {
			position: fixed; left: -360px; top: 0; z-index: 99;
			transition: left 0.2s; height: 100vh; width: 300px; max-width: 80vw;
			box-shadow: 2px 0 8px rgba(0,0,0,0.1);
		}
		.sidebar.open { left: 0; }
		main { padding: 24px 16px 64px; }
	}
</style>
