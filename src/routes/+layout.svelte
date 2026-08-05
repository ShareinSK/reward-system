<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import favicon from '$lib/assets/logo-mark.svg';
	import logoNav from '$lib/assets/logo-with-text.svg';
	import iconAdmin from '$lib/assets/admin.svg';
	import iconDashboard from '$lib/assets/dashboard.svg';
	import iconParticipants from '$lib/assets/participants.svg';
	import iconReward from '$lib/assets/reward.svg';
	import iconSettings from '$lib/assets/settings.svg';
	import iconShare from '$lib/assets/share-configuration.svg';
	import iconTask from '$lib/assets/task.svg';
	import OnboardingGuide from '$lib/components/OnboardingGuide.svelte';
	import { copyFor, navLabels } from '$lib/experience';
	import { fetchEntitlement, startTrial } from '$lib/entitlements';
	import { isFeatureEnabled } from '$lib/featureFlags';
	import { ensureHouseholdId, fetchHousehold } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { shouldStartOnboarding } from '$lib/onboarding';
	import { startLocalQuestReminderLoop } from '$lib/localQuestReminders';
	import { fetchMyProfile, isStaffRole } from '$lib/profile';
	import { getSupabaseConfigError, supabase } from '$lib/supabase';
	import type { ExperienceMode, Profile } from '$lib/types';
	import type { Session } from '@supabase/supabase-js';
	import './layout.css';

	let { children } = $props();

	let session = $state<Session | null>(null);
	let ready = $state(false);
	let configError = $state<string | null>(null);
	let experienceMode = $state<ExperienceMode>('kids');
	let profile = $state<Profile | null>(null);
	let pricingEnabled = $state(false);
	let showOnboarding = $state(false);

	const labels = $derived(navLabels(experienceMode));
	const useGoalsUi = $derived(experienceMode === 'goals');

	const nav = $derived([
		{ href: '/dashboard', label: labels.dashboard, icon: iconDashboard },
		{ href: '/participants', label: labels.participants, icon: iconParticipants },
		{ href: '/activities', label: labels.activities, icon: iconTask },
		{ href: '/rewards', label: labels.rewards, icon: iconReward },
		{ href: '/share', label: labels.share, icon: iconShare },
		{ href: '/settings', label: labels.settings, icon: iconSettings }
	] as const);

	async function refreshHouseholdChrome(userSession: Session | null) {
		if (!userSession) {
			experienceMode = 'kids';
			profile = null;
			pricingEnabled = false;
			showOnboarding = false;
			return;
		}
		try {
			profile = await fetchMyProfile();
			const hid = await ensureHouseholdId();
			setActiveHouseholdId(hid);
			const [household, pricing, entitlement] = await Promise.all([
				fetchHousehold(hid),
				isFeatureEnabled('billing_pricing', hid),
				fetchEntitlement(hid)
			]);
			experienceMode = household.experience_mode;
			pricingEnabled = pricing;

			// Soft launch: start Pro trial automatically when pricing UI is off.
			if (!pricing && entitlement?.plan === 'free') {
				try {
					await startTrial(15);
				} catch {
					// Already trial/pro, or not owner / migration missing
				}
			}

			if (shouldStartOnboarding(profile)) {
				showOnboarding = true;
			}
		} catch {
			// Migration may not be applied yet
		}
	}

	$effect(() => {
		let mounted = true;
		const missing = getSupabaseConfigError();
		if (missing) {
			configError = missing;
			ready = true;
			return;
		}

		supabase.auth.getSession().then(async ({ data }) => {
			if (!mounted) return;
			session = data.session;
			await refreshHouseholdChrome(data.session);
			ready = true;
		});

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, next) => {
			session = next;
			refreshHouseholdChrome(next);
		});

		return () => {
			mounted = false;
			subscription.unsubscribe();
		};
	});

	const path = $derived((page.url.pathname.replace(base, '') || '/').replace(/\/$/, '') || '/');
	const showChrome = $derived(
		ready &&
			session &&
			path !== '/' &&
			!path.startsWith('/login') &&
			!path.startsWith('/auth') &&
			!path.startsWith('/privacy') &&
			!path.startsWith('/terms') &&
			!path.startsWith('/feedback') &&
			!path.startsWith('/join') &&
			!path.startsWith('/brand-preview')
	);

	async function signOut() {
		setActiveHouseholdId(null);
		await supabase.auth.signOut();
		goto(resolve('/'), { replaceState: true });
	}

	function isActive(href: string) {
		return path === href || path.startsWith(href + '/');
	}

	function tourTargetFor(href: string) {
		const key = href.replace(/^\//, '');
		return `nav-${key}`;
	}

	function closeOnboarding() {
		showOnboarding = false;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		const onReplay = () => {
			showOnboarding = true;
		};
		window.addEventListener('hh:start-onboarding', onReplay);
		return () => window.removeEventListener('hh:start-onboarding', onReplay);
	});

	$effect(() => {
		if (!showChrome || !session) return;
		return startLocalQuestReminderLoop();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={`${base}/pwa/apple-touch-icon.png`} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	{#if useGoalsUi}
		<link
			href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600;700&display=swap"
			rel="stylesheet"
		/>
	{:else}
		<link
			href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700&family=Outfit:wght@400;500;600&display=swap"
			rel="stylesheet"
		/>
	{/if}
	<title>QuestorLog — Quest Log</title>
	<meta name="description" content={copyFor(experienceMode, 'tagline')} />
	<meta name="theme-color" content={useGoalsUi ? '#0f766e' : '#6366f1'} />
</svelte:head>

<div
	class="app-shell"
	class:app-shell--nav={showChrome}
	class:theme-kids={!useGoalsUi}
	class:theme-goals={useGoalsUi}
>
	{#if showChrome}
		<header class="topbar">
			<a class="brand" href={resolve('/dashboard/')}>
				<img class="brand__logo" src={logoNav} alt="QuestorLog" width="328" height="96" />
			</a>

			<nav class="top-nav" aria-label="Primary">
				{#each nav as item}
					<a
						href={resolve(`${item.href}/`)}
						class:active={isActive(item.href)}
						data-tour={tourTargetFor(item.href)}
					>
						<img class="nav-icon" src={item.icon} alt="" width="47" height="47" />
						<span class="nav-label">{item.label}</span>
					</a>
				{/each}
				{#if pricingEnabled}
					<a href={resolve('/billing/')} class:active={isActive('/billing')}>Billing</a>
				{/if}
				{#if isStaffRole(profile?.app_role)}
					<a href={resolve('/admin/')} class:active={isActive('/admin')}>
						<img class="nav-icon" src={iconAdmin} alt="" width="47" height="47" />
						<span class="nav-label">Admin</span>
					</a>
				{/if}
			</nav>

			<button type="button" class="signout" onclick={signOut}>Sign out</button>
		</header>

		<nav class="bottom-nav" aria-label="Mobile">
			{#each nav as item}
				<a
					href={resolve(`${item.href}/`)}
					class:active={isActive(item.href)}
					aria-label={item.label}
					title={item.label}
					data-tour={tourTargetFor(item.href)}
				>
					<img class="nav-icon" src={item.icon} alt="" width="47" height="47" />
				</a>
			{/each}
			{#if isStaffRole(profile?.app_role)}
				<a
					href={resolve('/admin/')}
					class:active={isActive('/admin')}
					aria-label="Admin"
					title="Admin"
				>
					<img class="nav-icon" src={iconAdmin} alt="" width="47" height="47" />
				</a>
			{/if}
		</nav>
	{/if}

	<main class="main">
		{#if configError}
			<section class="config-error">
				<p class="eyebrow">Configuration</p>
				<h1>Supabase is not configured for this deploy</h1>
				<p>{configError}</p>
				<ol>
					<li>Repo → Settings → Secrets and variables → Actions</li>
					<li>
						Add <code>PUBLIC_SUPABASE_URL</code> and
						<code>PUBLIC_SUPABASE_ANON_KEY</code>
					</li>
					<li>Re-run the “Deploy to GitHub Pages” workflow</li>
				</ol>
			</section>
		{:else}
			{@render children()}
		{/if}
	</main>

	{#if showChrome && showOnboarding}
		<OnboardingGuide open={showOnboarding} {experienceMode} onClose={closeOnboarding} />
	{/if}
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
			radial-gradient(ellipse at 12% -8%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 42%),
			radial-gradient(ellipse at 92% 4%, color-mix(in srgb, var(--amber) 14%, transparent), transparent 38%),
			linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 48%, var(--bg-2) 100%);
	}

	.app-shell {
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr;
	}

	.app-shell--nav {
		padding-bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));
	}

	.topbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--bg-0) 90%, white);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 20;
		min-height: 4.75rem;
	}

	@media (min-width: 640px) {
		.topbar {
			padding: 0.75rem 1.5rem;
			min-height: 5.25rem;
		}
	}

	@media (min-width: 768px) {
		.topbar {
			padding: 0.65rem clamp(1rem, 3vw, 2rem);
		}

		.app-shell--nav {
			padding-bottom: 0;
		}
	}

	.brand {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		color: var(--text);
		margin-right: auto;
		min-height: 44px;
		padding: 0.15rem 0.25rem;
		border-radius: 0.85rem;
	}

	.brand__logo {
		display: block;
		height: 3.35rem;
		width: auto;
		max-width: min(62vw, 16rem);
		object-fit: contain;
		object-position: left center;
	}

	@media (min-width: 640px) {
		.brand__logo {
			height: 3.85rem;
			max-width: 19rem;
		}
	}

	.top-nav {
		display: none;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.top-nav a {
		text-decoration: none;
		color: var(--text-muted);
		padding: 0.45rem 0.85rem 0.45rem 0.55rem;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 999px;
		font-size: 0.9rem;
		transition: transform 0.15s ease;
	}

	.top-nav a:hover {
		transform: scale(1.02);
	}

	.top-nav a:active {
		transform: scale(0.95);
	}

	.top-nav a.active,
	.top-nav a:hover {
		color: var(--accent-ink);
		background: var(--accent);
	}

	.signout {
		border: 1px solid var(--border-strong);
		background: var(--surface-strong);
		color: var(--accent);
		border-radius: 999px;
		padding: 0.55rem 0.95rem;
		min-height: 44px;
		min-width: 44px;
		cursor: pointer;
		font: inherit;
		font-size: 0.85rem;
		transition: transform 0.15s ease;
	}

	.signout:hover {
		transform: scale(1.02);
	}

	.signout:active {
		transform: scale(0.95);
	}

	.bottom-nav {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.15rem;
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		padding: 0.4rem 0.35rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
		background: rgba(255, 255, 255, 0.96);
		border-top: 1px solid var(--border);
		backdrop-filter: blur(12px);
		box-shadow: 0 -8px 24px color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.bottom-nav a {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 56px;
		min-width: 44px;
		padding: 0.25rem;
		border-radius: 0.85rem;
		text-decoration: none;
		color: var(--text-soft);
		transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
	}

	.bottom-nav a:active {
		transform: scale(0.95);
	}

	.bottom-nav a.active {
		color: var(--accent-bright);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}

	.nav-icon {
		width: 47px;
		height: 47px;
		display: block;
		flex-shrink: 0;
		object-fit: contain;
	}

	.nav-label {
		line-height: 1.1;
	}

	.main {
		width: min(1100px, 100%);
		margin: 0 auto;
		padding: 1rem 1rem 2rem;
	}

	@media (min-width: 640px) {
		.main {
			padding: 1.25rem 1.5rem 2.5rem;
		}
	}

	@media (min-width: 768px) {
		.top-nav {
			display: flex;
		}

		.bottom-nav {
			display: none;
		}

		.main {
			padding: 1.5rem clamp(1rem, 3vw, 2rem) 3rem;
		}
	}

	.config-error {
		max-width: 40rem;
		margin: 2rem auto;
		padding: 1.5rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		color: var(--text);
	}

	.config-error .eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}

	.config-error h1 {
		margin: 0.35rem 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1.45rem;
	}

	.config-error ol {
		margin: 0.75rem 0 0;
		padding-left: 1.2rem;
		color: var(--text-muted);
		line-height: 1.55;
	}

	.config-error code {
		font-size: 0.9em;
	}
</style>
