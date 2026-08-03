<script lang="ts">
	import { fetchGrandRewards } from '$lib/api';
	import UpgradeBanner from '$lib/components/UpgradeBanner.svelte';
	import { fetchPlanLimits, isAtCap, parsePlanLimitError } from '$lib/entitlements';
	import { copyFor } from '$lib/experience';
	import { isFeatureEnabled } from '$lib/featureFlags';
	import { ensureHouseholdId, fetchHousehold } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import {
		formatPoints,
		normalizePoints,
		pointsStep,
		settingsFromHousehold
	} from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type { ExperienceMode, GrandReward, HouseholdSettings, PlanLimits } from '$lib/types';
	import { DEFAULT_HOUSEHOLD_SETTINGS, FREE_LIMITS } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let rewards = $state<GrandReward[]>([]);
	let settings = $state<HouseholdSettings>({ ...DEFAULT_HOUSEHOLD_SETTINGS });
	let title = $state('');
	let pointsRequired = $state(50);
	let description = $state('');
	let error = $state('');
	let loading = $state(true);
	let limits = $state<PlanLimits>({ ...FREE_LIMITS });
	let mode = $state<ExperienceMode>('kids');
	let billingEnabled = $state(false);
	let pricingEnabled = $state(false);

	const step = $derived(pointsStep(settings.allow_decimal_points));
	const atCap = $derived(isAtCap(rewards.length, limits.max_rewards));
	const label = $derived(copyFor(mode, 'reward'));
	const labelPlural = $derived(copyFor(mode, 'rewards'));

	async function load() {
		loading = true;
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
			const [list, household, lim, billing, pricing] = await Promise.all([
				fetchGrandRewards(),
				fetchHousehold(hid),
				fetchPlanLimits(hid),
				isFeatureEnabled('billing_checkout', hid),
				isFeatureEnabled('billing_pricing', hid)
			]);
			rewards = list;
			settings = settingsFromHousehold(household);
			limits = lim;
			mode = household.experience_mode;
			billingEnabled = billing;
			pricingEnabled = pricing;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function addReward(e: Event) {
		e.preventDefault();
		error = '';
		if (atCap) {
			error = `Free plan allows ${limits.max_rewards} ${labelPlural.toLowerCase()}.`;
			return;
		}
		const required = normalizePoints(Number(pointsRequired), {
			allow_decimal_points: settings.allow_decimal_points,
			allow_negative_points: true
		});
		if (Number.isNaN(required) || required <= 0) {
			error = 'XP required must be greater than zero.';
			return;
		}
		const {
			data: { user }
		} = await supabase.auth.getUser();
		const household_id = await ensureHouseholdId();
		setActiveHouseholdId(household_id);
		const { error: insertError } = await supabase.from('grand_rewards').insert({
			title: title.trim(),
			points_required: Math.abs(required),
			description: description.trim(),
			created_by: user?.id ?? null,
			household_id
		});
		if (insertError) {
			const planErr = parsePlanLimitError(insertError.message);
			error = planErr?.message ?? insertError.message;
			return;
		}
		title = '';
		pointsRequired = 50;
		description = '';
		await load();
	}

	async function removeReward(id: string) {
		const { error: deleteError } = await supabase.from('grand_rewards').delete().eq('id', id);
		if (deleteError) {
			error = deleteError.message;
			return;
		}
		await load();
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Guild lists</p>
		<h1>{labelPlural}</h1>
		<p class="cap-hint">{rewards.length} / {limits.max_rewards} on {limits.plan}</p>
		<p class="lede">
			XP totals follow <a href={resolve('/settings/')}>Guild Stats</a>
			{#if !settings.allow_decimal_points}
				· whole numbers only
			{/if}
		</p>
	</header>

	{#if atCap}
		<UpgradeBanner
			resource={labelPlural.toLowerCase()}
			limit={limits.max_rewards}
			{billingEnabled}
			{pricingEnabled}
		/>
	{/if}

	{#if !atCap}
		<form class="form" onsubmit={addReward}>
			<label>
				<span>Title</span>
				<input bind:value={title} required placeholder="Movie night" />
			</label>
			<label>
				<span>XP required</span>
				<input bind:value={pointsRequired} type="number" step={step} min="1" required />
			</label>
			<label class="grow">
				<span>Description</span>
				<input bind:value={description} placeholder="Optional details" />
			</label>
			<button type="submit">Add {label}</button>
		</form>
	{/if}

	{#if error}
		<p class="alert">{error}</p>
	{/if}

	{#if loading}
		<p class="muted">Loading…</p>
	{:else}
		<ul>
			{#each rewards as r (r.id)}
				<li>
					<div>
						<strong>{r.title}</strong>
						<span class="muted"
							>{formatPoints(Number(r.points_required), settings.allow_decimal_points)} XP</span
						>
						{#if r.description}
							<p>{r.description}</p>
						{/if}
					</div>
					<button type="button" onclick={() => removeReward(r.id)}>Remove</button>
				</li>
			{:else}
				<li class="muted">No {labelPlural.toLowerCase()} yet.</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1.25rem;
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
		margin: 0.2rem 0 0;
		font-family: var(--font-display);
		color: var(--text);
	}
	.cap-hint {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--text-soft);
		text-transform: capitalize;
	}
	.lede {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.lede a {
		color: var(--accent);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: stretch;
	}
	@media (min-width: 640px) {
		.form {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: end;
		}
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.grow {
		flex: 1 1 12rem;
	}
	input {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.7rem 0.85rem;
		min-height: 44px;
		font: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	button {
		border: none;
		border-radius: 0.75rem;
		padding: 0.7rem 0.95rem;
		min-height: 44px;
		min-width: 44px;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--accent-bright);
		color: var(--accent-ink);
		transition: transform 0.15s ease;
	}
	button:hover {
		transform: scale(1.02);
	}
	button:active {
		transform: scale(0.95);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: start;
		gap: 0.75rem;
		padding: 0.85rem 0.9rem;
		min-height: 44px;
		border-radius: 0.9rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		transition: transform 0.15s ease;
	}
	li:hover {
		transform: scale(1.02);
	}
	li:active {
		transform: scale(0.98);
	}
	li div {
		display: grid;
		gap: 0.15rem;
	}
	li strong {
		font-family: var(--font-display);
	}
	li .muted {
		color: var(--amber);
		font-family: var(--font-display);
		font-weight: 600;
	}
	li p {
		margin: 0.15rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	li button {
		background: var(--surface-strong);
		color: var(--amber);
		border: 1px solid rgba(245, 158, 11, 0.35);
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.alert {
		color: var(--danger-text);
	}
</style>
