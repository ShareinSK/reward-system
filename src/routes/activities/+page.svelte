<script lang="ts">
	import { fetchActivities, fetchParticipants } from '$lib/api';
	import UpgradeBanner from '$lib/components/UpgradeBanner.svelte';
	import { fetchPlanLimits, isAtCap, parsePlanLimitError } from '$lib/entitlements';
	import { copyFor } from '$lib/experience';
	import { isFeatureEnabled } from '$lib/featureFlags';
	import { ensureHouseholdId, fetchHousehold } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { normalizeTimeOfDay, timeOfDayLabel } from '$lib/questReminders';
	import {
		formatPoints,
		normalizePoints,
		pointsStep,
		settingsFromHousehold
	} from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type {
		Activity,
		ExperienceMode,
		HouseholdSettings,
		Participant,
		PlanLimits,
		TimeOfDay
	} from '$lib/types';
	import { DEFAULT_HOUSEHOLD_SETTINGS, FREE_LIMITS, TIME_OF_DAY_OPTIONS } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let activities = $state<Activity[]>([]);
	let participants = $state<Participant[]>([]);
	let settings = $state<HouseholdSettings>({ ...DEFAULT_HOUSEHOLD_SETTINGS });
	let title = $state('');
	let defaultPoints = $state(1);
	let allowNegative = $state(false);
	let timeOfDay = $state<TimeOfDay>('all_day');
	/** Empty string = everyone */
	let assigneeId = $state('');
	let error = $state('');
	let loading = $state(true);
	let limits = $state<PlanLimits>({ ...FREE_LIMITS });
	let mode = $state<ExperienceMode>('kids');
	let billingEnabled = $state(false);
	let pricingEnabled = $state(false);

	const step = $derived(pointsStep(settings.allow_decimal_points));
	const atCap = $derived(isAtCap(activities.length, limits.max_activities));
	const label = $derived(copyFor(mode, 'activity'));
	const labelPlural = $derived(copyFor(mode, 'activities'));
	const questorLabel = $derived(copyFor(mode, 'participant'));

	function participantName(id: string | null): string {
		if (!id) return 'Everyone';
		return participants.find((p) => p.id === id)?.name ?? 'Questor';
	}

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
			const [list, people, household, lim, billing, pricing] = await Promise.all([
				fetchActivities(),
				fetchParticipants(),
				fetchHousehold(hid),
				fetchPlanLimits(hid),
				isFeatureEnabled('billing_checkout', hid),
				isFeatureEnabled('billing_pricing', hid)
			]);
			activities = list;
			participants = people;
			settings = settingsFromHousehold(household);
			limits = lim;
			mode = household.experience_mode;
			billingEnabled = billing;
			pricingEnabled = pricing;
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
		if (atCap) {
			error = `Free plan allows ${limits.max_activities} ${labelPlural.toLowerCase()}.`;
			return;
		}
		const points = normalizePoints(Number(defaultPoints), {
			...settings,
			allow_negative_points: true
		});
		if (Number.isNaN(points) || points === 0) {
			error = 'Default XP must be a non-zero number.';
			return;
		}
		if (assigneeId && !participants.some((p) => p.id === assigneeId)) {
			error = `Choose a valid ${questorLabel.toLowerCase()} or Everyone.`;
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
			time_of_day: timeOfDay,
			assignee_participant_id: assigneeId || null,
			created_by: user?.id ?? null,
			household_id
		});
		if (insertError) {
			const planErr = parsePlanLimitError(insertError.message);
			error = planErr?.message ?? insertError.message;
			return;
		}
		title = '';
		defaultPoints = 1;
		allowNegative = false;
		timeOfDay = 'all_day';
		assigneeId = '';
		await load();
	}

	async function updateActivityField(
		id: string,
		patch: Partial<Pick<Activity, 'time_of_day' | 'assignee_participant_id'>>
	) {
		error = '';
		const { error: updateError } = await supabase.from('activities').update(patch).eq('id', id);
		if (updateError) {
			error = updateError.message;
			return;
		}
		activities = activities.map((a) => (a.id === id ? { ...a, ...patch } : a));
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
		<p class="eyebrow">Guild lists</p>
		<h1>{labelPlural}</h1>
		<p class="cap-hint">{activities.length} / {limits.max_activities} on {limits.plan}</p>
		<p class="lede">
			Scoring rules follow <a href={resolve('/settings/')}>Guild Stats</a>
			{#if !settings.allow_decimal_points}
				· whole numbers only
			{/if}
		</p>
	</header>

	{#if atCap}
		<UpgradeBanner
			resource={labelPlural.toLowerCase()}
			limit={limits.max_activities}
			{billingEnabled}
			{pricingEnabled}
		/>
	{/if}

	{#if !atCap}
		<form class="form" onsubmit={addActivity}>
			<label class="grow">
				<span>Title</span>
				<input bind:value={title} required placeholder="Completed project milestone" />
			</label>
			<label>
				<span>Default XP</span>
				<input bind:value={defaultPoints} type="number" step={step} min="1" required />
			</label>
			<label>
				<span>Expected time</span>
				<select bind:value={timeOfDay} required>
					{#each TIME_OF_DAY_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>For</span>
				<select bind:value={assigneeId}>
					<option value="">Everyone</option>
					{#each participants as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
			{#if settings.allow_negative_points}
				<label class="check">
					<input bind:checked={allowNegative} type="checkbox" />
					<span>Allow negative</span>
				</label>
			{/if}
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
			{#each activities as a (a.id)}
				<li>
					<div class="row-main">
						<strong>{a.title}</strong>
						<span class="muted"
							>{formatPoints(Number(a.default_points), settings.allow_decimal_points)} XP
							{#if settings.allow_negative_points && a.allow_negative}· negatives OK{/if}
							· {timeOfDayLabel(normalizeTimeOfDay(a.time_of_day))}
							· {participantName(a.assignee_participant_id)}</span
						>
						<div class="row-edits">
							<label>
								<span class="sr-only">Expected time</span>
								<select
									value={normalizeTimeOfDay(a.time_of_day)}
									onchange={(e) =>
										updateActivityField(a.id, {
											time_of_day: (e.currentTarget as HTMLSelectElement)
												.value as TimeOfDay
										})}
								>
									{#each TIME_OF_DAY_OPTIONS as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>
							<label>
								<span class="sr-only">Assignee</span>
								<select
									value={a.assignee_participant_id ?? ''}
									onchange={(e) => {
										const v = (e.currentTarget as HTMLSelectElement).value;
										updateActivityField(a.id, {
											assignee_participant_id: v || null
										});
									}}
								>
									<option value="">Everyone</option>
									{#each participants as p (p.id)}
										<option value={p.id}>{p.name}</option>
									{/each}
								</select>
							</label>
						</div>
					</div>
					<button type="button" onclick={() => removeActivity(a.id)}>Remove</button>
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
		.form .grow {
			flex: 1 1 12rem;
		}
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
		min-height: 44px;
	}
	.check input {
		width: 1.15rem;
		height: 1.15rem;
		accent-color: var(--accent);
	}
	input:not([type='checkbox']),
	select {
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
	@media (min-width: 640px) {
		input:not([type='checkbox']):not(.grow input),
		select {
			width: 11rem;
		}
		.form .grow input {
			width: 100%;
		}
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
		align-items: center;
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
	.row-main {
		display: grid;
		gap: 0.45rem;
		flex: 1 1 12rem;
	}
	li strong {
		font-family: var(--font-display);
	}
	li .muted {
		color: var(--amber);
		font-family: var(--font-display);
		font-weight: 600;
	}
	.row-edits {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.row-edits select {
		width: auto;
		min-width: 8.5rem;
		padding: 0.45rem 0.65rem;
		min-height: 40px;
		font-size: 0.85rem;
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
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
