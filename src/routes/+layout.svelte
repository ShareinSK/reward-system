<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { Session } from '@supabase/supabase-js';
	import './layout.css';

	let { children } = $props();

	let session = $state<Session | null>(null);
	let ready = $state(false);

	const nav = [
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/participants', label: 'Participants' },
		{ href: '/activities', label: 'Activities' },
		{ href: '/rewards', label: 'Rewards' },
		{ href: '/share', label: 'Share' }
	] as const;

	$effect(() => {
		let mounted = true;

		supabase.auth.getSession().then(({ data }) => {
			if (!mounted) return;
			session = data.session;
			ready = true;
		});

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, next) => {
			session = next;
		});

		return () => {
			mounted = false;
			subscription.unsubscribe();
		};
	});

	async function signOut() {
		setActiveHouseholdId(null);
		await supabase.auth.signOut();
		goto(`${base}/login`);
	}

	const path = $derived(page.url.pathname.replace(base, '') || '/');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
		rel="stylesheet"
	/>
	<title>Reward System</title>
</svelte:head>

<div class="app-shell">
	{#if ready && session && path !== '/login'}
		<header class="topbar">
			<a class="brand" href={resolve('/dashboard')}>
				<span class="brand__mark" aria-hidden="true"></span>
				<span class="brand__name">Reward System</span>
			</a>
			<nav>
				{#each nav as item}
					<a
						href={resolve(item.href)}
						class:active={path === item.href || path.startsWith(item.href + '/')}
					>
						{item.label}
					</a>
				{/each}
			</nav>
			<button type="button" class="signout" onclick={signOut}>Sign out</button>
		</header>
	{/if}

	<main class="main">
		{@render children()}
	</main>
</div>

<style>
	:global(html) {
		color-scheme: light;
	}

	:global(body) {
		margin: 0;
		min-height: 100dvh;
		font-family: var(--font-body);
		color: var(--text);
		background:
			radial-gradient(ellipse at 12% -8%, rgba(45, 212, 191, 0.22), transparent 42%),
			radial-gradient(ellipse at 92% 4%, rgba(245, 158, 11, 0.12), transparent 38%),
			linear-gradient(180deg, #f3f8f6 0%, #e7f0ed 48%, #dce8e3 100%);
	}

	.app-shell {
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr;
	}

	.topbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 0.9rem clamp(1rem, 3vw, 2rem);
		border-bottom: 1px solid var(--border);
		background: rgba(247, 251, 249, 0.86);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		text-decoration: none;
		color: var(--text);
		margin-right: auto;
	}

	.brand__mark {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 0.2rem;
		background: linear-gradient(135deg, #14b8a6, #f59e0b);
		box-shadow: 0 0 14px rgba(13, 148, 136, 0.35);
	}

	.brand__name {
		font-family: var(--font-display);
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	nav a {
		text-decoration: none;
		color: var(--text-muted);
		padding: 0.4rem 0.7rem;
		border-radius: 999px;
		font-size: 0.9rem;
	}

	nav a.active,
	nav a:hover {
		color: var(--accent-ink);
		background: var(--accent);
	}

	.signout {
		border: 1px solid var(--border-strong);
		background: var(--surface-strong);
		color: var(--accent);
		border-radius: 999px;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		font: inherit;
		font-size: 0.85rem;
	}

	.main {
		width: min(1100px, 100%);
		margin: 0 auto;
		padding: 1.5rem clamp(1rem, 3vw, 2rem) 3rem;
	}
</style>
