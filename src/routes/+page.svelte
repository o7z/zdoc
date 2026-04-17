<script>
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

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
	<article class="doc-content">
		{@html data.html}
	</article>
{/if}

<style>
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
</style>
