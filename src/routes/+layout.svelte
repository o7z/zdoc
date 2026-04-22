<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import '../app.css';

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let darkMode = $state(false);
	let searchOpen = $state(false);
	let searchQuery = $state('');
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
			if (saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
				darkMode = true;
				document.documentElement.classList.add('dark');
			}
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
			navigator.clipboard.writeText(code.textContent || '').then(() => {
				btn.textContent = 'Copied!';
				btn.classList.add('copied');
				setTimeout(() => {
					btn.textContent = 'Copy';
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
		</div>
	</header>

	<div class="body">
		<nav class="sidebar" class:open={sidebarOpen}>
			{#each data.sidebar as group}
				{@render sidebarGroup(group, 0)}
			{/each}
		</nav>
		<main>
			{@render children()}
		</main>
	</div>
</div>

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
					autofocus
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
		width: 280px; min-width: 280px; padding: 16px 0;
		border-right: 1px solid var(--border); overflow-y: auto;
		background: var(--bg); flex-shrink: 0;
	}
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
			position: fixed; left: -280px; top: 0; z-index: 99;
			transition: left 0.2s; height: 100vh;
			box-shadow: 2px 0 8px rgba(0,0,0,0.1);
		}
		.sidebar.open { left: 0; }
		main { padding: 24px 16px 64px; }
	}
</style>
