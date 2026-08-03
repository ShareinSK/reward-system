<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ensureHouseholdId,
		fetchHousehold,
		updateHouseholdSettings
	} from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { settingsFromHousehold } from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type { Household, HouseholdSettings } from '$lib/types';

	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let notice = $state('');
	let household = $state<Household | null>(null);

	let allowNegative = $state(false);
	let allowDecimals = $state(false);

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
			household = await fetchHousehold(hid);
			const settings = settingsFromHousehold(household);
			allowNegative = settings.allow_negative_points;
			allowDecimals = settings.allow_decimal_points;
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
			allowNegative = saved.allow_negative_points;
			allowDecimals = saved.allow_decimal_points;
			household = { ...household, ...saved };
			notice = 'Settings saved.';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Configuration</p>
		<h1>Settings</h1>
		<p class="lede">
			Tune scoring rules so everyone sees points the same way.
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

		<form class="panel" onsubmit={save}>
			{#if household}
				<p class="group-name">{household.name}</p>
			{/if}

			<label class="toggle">
				<input bind:checked={allowDecimals} type="checkbox" />
				<span>
					<strong>Allow decimal points</strong>
					<em>When off, scores stay whole numbers (1, 2, 5) instead of values like 2.5.</em>
				</span>
			</label>

			<label class="toggle">
				<input bind:checked={allowNegative} type="checkbox" />
				<span>
					<strong>Allow negative points</strong>
					<em>When off, managers can’t subtract points for activities. Claiming a grand reward still spends points.</em>
				</span>
			</label>

			<button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
		</form>
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
	h1 {
		margin: 0.2rem 0 0;
		font-family: var(--font-display);
		color: var(--text);
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
</style>
