<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fetchEntitlement, fetchPlanLimits, startTrial } from '$lib/entitlements';
	import { isFeatureEnabled } from '$lib/featureFlags';
	import { ensureHouseholdId, fetchHousehold, fetchHouseholdMembers } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { HouseholdEntitlement, PlanLimits, PlanPrice } from '$lib/types';
	import { FREE_LIMITS, PRO_LIMITS } from '$lib/types';

	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let entitlement = $state<HouseholdEntitlement | null>(null);
	let limits = $state<PlanLimits>({ ...FREE_LIMITS });
	let memberCount = $state(0);
	let prices = $state<PlanPrice[]>([]);
	let billingEnabled = $state(false);
	let isOwner = $state(false);
	let checkoutLoading = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(resolve('/'), { replaceState: true });
				return;
			}
			const hid = await ensureHouseholdId();
			setActiveHouseholdId(hid);
			const [ent, lim, members, household, billing, priceRows] = await Promise.all([
				fetchEntitlement(hid),
				fetchPlanLimits(hid),
				fetchHouseholdMembers(hid),
				fetchHousehold(hid),
				isFeatureEnabled('billing_checkout', hid),
				supabase.from('plan_prices').select('*').eq('active', true).order('country_or_region')
			]);
			entitlement = ent;
			limits = lim;
			memberCount = members.length;
			billingEnabled = billing;
			prices = (priceRows.data ?? []) as PlanPrice[];
			isOwner = members.some((m) => m.user_id === session.user.id && m.role === 'owner');
			void household;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function beginTrial() {
		error = '';
		notice = '';
		try {
			entitlement = await startTrial(15);
			notice = '15-day Pro trial started.';
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function startCheckout(country = 'US') {
		checkoutLoading = true;
		error = '';
		try {
			const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
				body: {
					country_or_region: country,
					success_url: `${window.location.origin}${resolve('/billing/')}?checkout=success`,
					cancel_url: `${window.location.origin}${resolve('/billing/')}?checkout=cancel`
				}
			});
			if (fnError) throw fnError;
			if (data?.error) throw new Error(data.error);
			if (data?.url) {
				window.location.href = data.url as string;
				return;
			}
			throw new Error('Checkout is not available yet.');
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			checkoutLoading = false;
		}
	}

	async function openPortal() {
		error = '';
		try {
			const { data, error: fnError } = await supabase.functions.invoke('create-portal-session', {
				body: {
					return_url: `${window.location.origin}${resolve('/billing/')}`
				}
			});
			if (fnError) throw fnError;
			if (data?.error) throw new Error(data.error);
			if (data?.url) {
				window.location.href = data.url as string;
				return;
			}
			throw new Error('Billing portal is not available yet.');
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	const trialEnds = $derived(
		entitlement?.trial_ends_at
			? new Date(entitlement.trial_ends_at).toLocaleDateString()
			: null
	);
</script>

<section class="page">
	<header>
		<p class="eyebrow">Plan</p>
		<h1>Billing</h1>
		<p class="lede">
			Free includes 1 guild mate, 2 questors, 5 quests, and 3 bounties. Pro unlocks up to 3
			guild mates, 10 questors, 50 quests, and 20 bounties.
		</p>
	</header>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else}
		{#if error}
			<p class="alert">{error}</p>
		{/if}
		{#if notice}
			<p class="ok">{notice}</p>
		{/if}

		<div class="panel">
			<h2>Current plan</h2>
			<p class="plan-name">{limits.plan}</p>
			{#if trialEnds}
				<p class="muted">Trial ends {trialEnds}</p>
			{/if}
			<ul class="limits">
				<li>Guild mates: {memberCount} / {limits.max_members}</li>
				<li>Questors: up to {limits.max_participants}</li>
				<li>Quests: up to {limits.max_activities}</li>
				<li>Bounties: up to {limits.max_rewards}</li>
			</ul>
		</div>

		<div class="panel compare">
			<div>
				<h3>Free</h3>
				<ul>
					<li>{FREE_LIMITS.max_members} guild mate</li>
					<li>{FREE_LIMITS.max_participants} questors</li>
					<li>{FREE_LIMITS.max_activities} quests</li>
					<li>{FREE_LIMITS.max_rewards} bounties</li>
				</ul>
			</div>
			<div>
				<h3>Pro</h3>
				<ul>
					<li>{PRO_LIMITS.max_members} guild mates</li>
					<li>{PRO_LIMITS.max_participants} questors</li>
					<li>{PRO_LIMITS.max_activities} quests</li>
					<li>{PRO_LIMITS.max_rewards} bounties</li>
				</ul>
				{#if prices.length}
					<p class="prices">
						{#each prices as p}
							<span>{p.country_or_region}: {p.amount_display}/{p.interval}</span>
						{/each}
					</p>
				{:else}
					<p class="muted">From $4.99 / ₹49 per month (by country).</p>
				{/if}
			</div>
		</div>

		{#if isOwner}
			<div class="actions">
				{#if billingEnabled}
					{#if entitlement?.plan === 'pro' && entitlement.stripe_subscription_id}
						<button type="button" onclick={openPortal}>Manage subscription</button>
					{:else}
						<button type="button" disabled={checkoutLoading} onclick={() => startCheckout('US')}>
							{checkoutLoading ? 'Opening…' : 'Upgrade (US $4.99)'}
						</button>
						<button type="button" class="ghost" disabled={checkoutLoading} onclick={() => startCheckout('IN')}>
							Upgrade (India ₹49)
						</button>
						{#if entitlement?.plan === 'free'}
							<button type="button" class="ghost" onclick={beginTrial}>Start 15-day trial</button>
						{/if}
					{/if}
				{:else}
					<p class="muted">
						Paid Pro is coming soon. During soft launch, ask an admin if you need higher limits for
						feedback.
					</p>
					{#if entitlement?.plan === 'free'}
						<button type="button" class="ghost" onclick={beginTrial}>
							Start 15-day Pro trial (preview)
						</button>
					{/if}
					<a href={resolve('/feedback/')}>Send feedback</a>
				{/if}
			</div>
		{:else}
			<p class="muted">Only the guild owner can manage billing.</p>
		{/if}
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}

	h1 {
		margin: 0.2rem 0 0.35rem;
		font-family: var(--font-display);
	}

	.lede,
	.muted {
		color: var(--text-muted);
		line-height: 1.45;
	}

	.panel {
		padding: 1.1rem;
		border-radius: 1.1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}

	.plan-name {
		margin: 0.25rem 0;
		font-size: 1.4rem;
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: capitalize;
	}

	.limits,
	.compare ul {
		margin: 0.5rem 0 0;
		padding-left: 1.1rem;
		color: var(--text-muted);
		line-height: 1.55;
	}

	.compare {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.compare {
			grid-template-columns: 1fr 1fr;
		}
	}

	.compare h3 {
		margin: 0;
		font-family: var(--font-display);
	}

	.prices {
		display: grid;
		gap: 0.25rem;
		margin: 0.75rem 0 0;
		font-size: 0.9rem;
		color: var(--text);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		align-items: center;
	}

	button,
	.actions a {
		min-height: 44px;
		padding: 0.55rem 1rem;
		border-radius: 999px;
		border: none;
		background: var(--accent);
		color: var(--accent-ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}

	button.ghost {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
	}

	.alert {
		background: var(--danger-bg);
		color: var(--danger-text);
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
	}

	.ok {
		background: var(--ok-bg);
		color: var(--ok-text);
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
	}
</style>
