<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { isFeatureEnabled } from '$lib/featureFlags';
	import {
		ensureHouseholdId,
		fetchHousehold,
		updateExperienceMode,
		updateHouseholdSettings
	} from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { resetOnboarding } from '$lib/onboarding';
	import { pushSupported, registerPushSubscription } from '$lib/notifications';
	import { fetchMyProfile } from '$lib/profile';
	import { settingsFromHousehold } from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type { ExperienceMode, Household, HouseholdSettings } from '$lib/types';

	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let notice = $state('');
	let household = $state<Household | null>(null);
	let pricingEnabled = $state(false);
	let guideBusy = $state(false);

	let allowNegative = $state(false);
	let allowDecimals = $state(false);
	let experienceMode = $state<ExperienceMode>('kids');
	let pushBusy = $state(false);

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
			const [hh, pricing] = await Promise.all([
				fetchHousehold(hid),
				isFeatureEnabled('billing_pricing', hid)
			]);
			household = hh;
			pricingEnabled = pricing;
			const settings = settingsFromHousehold(household);
			allowNegative = settings.allow_negative_points;
			allowDecimals = settings.allow_decimal_points;
			experienceMode = household.experience_mode;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function save(e: Event) {
		e.preventDefault();
		if (!household) return;
		saving = true;
		error = '';
		notice = '';
		try {
			const next: HouseholdSettings = {
				allow_negative_points: allowNegative,
				allow_decimal_points: allowDecimals
			};
			const saved = await updateHouseholdSettings(household.id, next);
			if (experienceMode !== household.experience_mode) {
				await updateExperienceMode(household.id, experienceMode);
			}
			allowNegative = saved.allow_negative_points;
			allowDecimals = saved.allow_decimal_points;
			household = { ...household, ...saved, experience_mode: experienceMode };
			notice = 'Guild Stats saved. Reload if the theme does not update.';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function enablePush() {
		pushBusy = true;
		error = '';
		try {
			const ok = await registerPushSubscription();
			notice = ok
				? 'Push notifications enabled.'
				: 'Push not available (needs install/permission or VAPID key).';
			await fetchMyProfile();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			pushBusy = false;
		}
	}

	async function replayGuide() {
		guideBusy = true;
		error = '';
		try {
			await resetOnboarding();
			window.dispatchEvent(new CustomEvent('hh:start-onboarding'));
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			guideBusy = false;
		}
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Configuration</p>
		<h1>Guild Stats</h1>
		<p class="lede">Tune scoring rules and choose Family adventures or Personal quests.</p>
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

		<form class="panel" onsubmit={save}>
			{#if household}
				<p class="group-name">{household.name}</p>
			{/if}

			<label class="toggle">
				<input
					type="radio"
					name="mode"
					value="kids"
					checked={experienceMode === 'kids'}
					onchange={() => (experienceMode = 'kids')}
				/>
				<span>
					<strong>Family adventures</strong>
					<em>Playful UI for family milestones.</em>
				</span>
			</label>

			<label class="toggle">
				<input
					type="radio"
					name="mode"
					value="goals"
					checked={experienceMode === 'goals'}
					onchange={() => (experienceMode = 'goals')}
				/>
				<span>
					<strong>Personal quests</strong>
					<em>Elegant quests and personal bounties.</em>
				</span>
			</label>

			<label class="toggle">
				<input bind:checked={allowDecimals} type="checkbox" />
				<span>
					<strong>Allow decimal XP</strong>
					<em>When off, scores stay whole numbers (1, 2, 5) instead of values like 2.5.</em>
				</span>
			</label>

			<label class="toggle">
				<input bind:checked={allowNegative} type="checkbox" />
				<span>
					<strong>Allow negative XP</strong>
					<em>When off, guild mates can’t subtract XP for quests. Claiming a bounty still spends XP.</em>
				</span>
			</label>

			<button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Guild Stats'}</button>
		</form>

		<div class="panel">
			<h2>Getting started</h2>
			<p class="muted">Replay the interactive tour of Questors, Quests, Bounties, and your Guild.</p>
			<button type="button" class="secondary" disabled={guideBusy} onclick={replayGuide}>
				{guideBusy ? 'Starting…' : 'Replay app guide'}
			</button>
		</div>

		<div class="panel">
			<h2>Notifications</h2>
			<p class="muted">
				Install QuestorLog as an app (Add to Home Screen) for the best push experience on phones.
			</p>
			{#if pushSupported()}
				<button type="button" class="secondary" disabled={pushBusy} onclick={enablePush}>
					{pushBusy ? 'Enabling…' : 'Enable push notifications'}
				</button>
			{:else}
				<p class="muted">Push is not supported in this browser.</p>
			{/if}
			<p class="legal">
				<a href={resolve('/privacy/')}>Privacy</a>
				·
				<a href={resolve('/terms/')}>Terms</a>
				·
				<a href={resolve('/feedback/')}>Feedback</a>
				{#if pricingEnabled}
					·
					<a href={resolve('/billing/')}>Billing</a>
				{/if}
			</p>
		</div>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1.25rem;
		max-width: 36rem;
	}
	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}
	h1,
	h2 {
		margin: 0.2rem 0 0;
		font-family: var(--font-display);
		color: var(--text);
	}
	h2 {
		font-size: 1.05rem;
		margin: 0;
	}
	.lede,
	.muted {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	.panel {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	@media (min-width: 640px) {
		.panel {
			padding: 1.15rem 1.2rem;
		}
	}
	.group-name {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--text);
	}
	.toggle {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.75rem;
		align-items: start;
		cursor: pointer;
		padding: 0.85rem 0.9rem;
		min-height: 44px;
		border-radius: 0.9rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		transition: transform 0.15s ease;
	}
	.toggle:hover {
		transform: scale(1.02);
	}
	.toggle:active {
		transform: scale(0.98);
	}
	.toggle strong {
		display: block;
		color: var(--text);
		font-size: 0.98rem;
		font-family: var(--font-display);
	}
	.toggle em {
		display: block;
		margin-top: 0.25rem;
		font-style: normal;
		color: var(--text-muted);
		font-size: 0.88rem;
		line-height: 1.4;
	}
	.toggle input {
		margin-top: 0.2rem;
		width: 1.25rem;
		height: 1.25rem;
		min-width: 1.25rem;
		accent-color: var(--accent);
	}
	button {
		justify-self: stretch;
		border: none;
		border-radius: 0.75rem;
		padding: 0.75rem 1rem;
		min-height: 44px;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--accent-bright);
		color: var(--accent-ink);
		transition: transform 0.15s ease;
	}
	button.secondary {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
		justify-self: start;
	}
	@media (min-width: 640px) {
		button {
			justify-self: start;
		}
	}
	button:hover:not(:disabled) {
		transform: scale(1.02);
	}
	button:active:not(:disabled) {
		transform: scale(0.95);
	}
	button:disabled {
		opacity: 0.6;
	}
	.alert {
		margin: 0;
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
		background: var(--danger-bg);
		color: var(--danger-text);
	}
	.ok {
		margin: 0;
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
		background: var(--ok-bg);
		color: var(--ok-text);
	}
	.legal {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-soft);
	}
	.legal a {
		color: var(--accent-bright);
	}
</style>
