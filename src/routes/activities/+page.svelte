<script lang="ts">
	import { fetchActivities } from '$lib/api';
	import { ensureHouseholdId, fetchHouseholdSettings } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import {
		formatPoints,
		normalizePoints,
		pointsStep,
		settingsFromHousehold
	} from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type { Activity, HouseholdSettings } from '$lib/types';
	import { DEFAULT_HOUSEHOLD_SETTINGS } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let activities = $state<Activity[]>([]);
	let settings = $state<HouseholdSettings>({ ...DEFAULT_HOUSEHOLD_SETTINGS });
	let title = $state('');
	let defaultPoints = $state(1);
	let allowNegative = $state(false);
	let error = $state('');
	let loading = $state(true);

	const step = $derived(pointsStep(settings.allow_decimal_points));

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
			const [list, s] = await Promise.all([fetchActivities(), fetchHouseholdSettings(hid)]);
			activities = list;
			settings = settingsFromHousehold(s);
			if (!settings.allow_negative_points) allowNegative = false;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function addActivity(e: Event) {
		e.preventDefault();
		error = '';
		const points = normalizePoints(Number(defaultPoints), {
			...settings,
			allow_negative_points: true // defaults can be positive-only via min; allow normalize rounding
		});
		if (Number.isNaN(points) || points === 0) {
			error = 'Default points must be a non-zero number.';
			return;
		}
		const {
			data: { user }
		} = await supabase.auth.getUser();
		const household_id = await ensureHouseholdId();
		setActiveHouseholdId(household_id);
		const { error: insertError } = await supabase.from('activities').insert({
			title: title.trim(),
			default_points: Math.abs(points),
			allow_negative: settings.allow_negative_points ? allowNegative : false,
			created_by: user?.id ?? null,
			household_id
		});
		if (insertError) {
			error = insertError.message;
			return;
		}
		title = '';
		defaultPoints = 1;
		allowNegative = false;
		await load();
	}

	async function removeActivity(id: string) {
		const { error: deleteError } = await supabase.from('activities').delete().eq('id', id);
		if (deleteError) {
			error = deleteError.message;
			return;
		}
		await load();
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Master lists</p>
		<h1>Activities</h1>
		<p class="lede">
			Scoring rules follow <a href={resolve('/settings/')}>Settings</a>
			{#if !settings.allow_decimal_points}
				· whole numbers only
			{/if}
		</p>
	</header>

	<form class="form" onsubmit={addActivity}>
		<label>
			<span>Title</span>
			<input bind:value={title} required placeholder="Washing the car" />
		</label>
		<label>
			<span>Default points</span>
			<input bind:value={defaultPoints} type="number" step={step} min="1" required />
		</label>
		{#if settings.allow_negative_points}
			<label class="check">
				<input bind:checked={allowNegative} type="checkbox" />
				<span>Allow negative</span>
			</label>
		{/if}
		<button type="submit">Add</button>
	</form>

	{#if error}
		<p class="alert">{error}</p>
	{/if}

	{#if loading}
		<p class="muted">Loading…</p>
	{:else}
		<ul>
			{#each activities as a (a.id)}
				<li>
					<div>
						<strong>{a.title}</strong>
						<span class="muted"
							>{formatPoints(Number(a.default_points), settings.allow_decimal_points)} pts
							{#if settings.allow_negative_points && a.allow_negative}· negatives OK{/if}</span
						>
					</div>
					<button type="button" onclick={() => removeActivity(a.id)}>Remove</button>
				</li>
			{:else}
				<li class="muted">No activities yet.</li>
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
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.55rem;
	}
	input:not([type='checkbox']) {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.65rem 0.8rem;
		font: inherit;
		width: 11rem;
	}
	button {
		border: none;
		border-radius: 0.75rem;
		padding: 0.65rem 0.95rem;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--accent-bright);
		color: #042f2e;
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
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.9rem;
		border-radius: 0.9rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	li div {
		display: grid;
		gap: 0.15rem;
	}
	li button {
		background: var(--surface-strong);
		color: var(--amber);
		border: 1px solid rgba(180, 83, 9, 0.3);
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.alert {
		color: var(--danger-text);
	}
</style>
