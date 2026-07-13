<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import RewardVault from '$lib/components/RewardVault.svelte';
	import {
		claimGrandReward,
		fetchActivities,
		fetchGrandRewards,
		fetchLedger,
		fetchParticipants,
		insertLedgerEntry,
		parsePointsWithAi
	} from '$lib/api';
	import { ensureHouseholdId } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import {
		balanceForParticipant,
		filterSince,
		startOfLocalDay,
		startOfLocalWeek,
		sumPoints
	} from '$lib/points';
	import { supabase } from '$lib/supabase';
	import type {
		Activity,
		AiLogPreview,
		GrandReward,
		Participant,
		PointsLedgerEntry
	} from '$lib/types';
	import { untrack } from 'svelte';

	let loading = $state(true);
	let error = $state('');
	let saving = $state(false);
	let allocateSuccess = $state('');

	let activities = $state<Activity[]>([]);
	let rewards = $state<GrandReward[]>([]);
	let participants = $state<Participant[]>([]);
	let ledger = $state<PointsLedgerEntry[]>([]);

	let activeParticipantId = $state<string | null>(null);

	// Manual allocate form
	let selectedActivityId = $state('');
	let allocatePoints = $state(1);
	let allocateNote = $state('');
	let selectedIds = $state<Record<string, boolean>>({});

	// AI (secondary)
	let aiText = $state('');
	let aiLoading = $state(false);
	let aiPreview = $state<AiLogPreview | null>(null);
	let aiError = $state('');

	const activeParticipant = $derived(
		participants.find((p) => p.id === activeParticipantId) ?? participants[0] ?? null
	);

	const participantLedger = $derived(
		activeParticipant
			? ledger.filter((e) => e.participant_id === activeParticipant.id)
			: []
	);

	const totalBalance = $derived(
		activeParticipant ? balanceForParticipant(ledger, activeParticipant.id) : 0
	);

	const dailyTotal = $derived(sumPoints(filterSince(participantLedger, startOfLocalDay())));
	const weeklyTotal = $derived(sumPoints(filterSince(participantLedger, startOfLocalWeek())));

	const nextReward = $derived.by(() => {
		const affordable = [...rewards].sort(
			(a, b) => Number(a.points_required) - Number(b.points_required)
		);
		return (
			affordable.find((r) => Number(r.points_required) > totalBalance) ??
			affordable[affordable.length - 1] ??
			null
		);
	});

	const targetPoints = $derived(nextReward ? Number(nextReward.points_required) : 100);

	const selectedActivity = $derived(
		activities.find((a) => a.id === selectedActivityId) ?? null
	);

	const checkedParticipants = $derived(participants.filter((p) => selectedIds[p.id]));

	const allSelected = $derived(
		participants.length > 0 && participants.every((p) => selectedIds[p.id])
	);

	const previewParticipant = $derived(
		aiPreview ? participants.find((p) => p.id === aiPreview!.participant_id) : null
	);
	const previewActivity = $derived(
		aiPreview ? activities.find((a) => a.id === aiPreview!.activity_id) : null
	);

	$effect(() => {
		let cancelled = false;

		(async () => {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(`${base}/login`);
				return;
			}
			try {
				setActiveHouseholdId(await ensureHouseholdId());
				const [a, r, p, l] = await Promise.all([
					fetchActivities(),
					fetchGrandRewards(),
					fetchParticipants(),
					fetchLedger()
				]);
				if (cancelled) return;
				activities = a;
				rewards = r;
				participants = p;
				ledger = l;
				if (!untrack(() => activeParticipantId) && p[0]) {
					activeParticipantId = p[0].id;
				}
				if (!untrack(() => selectedActivityId) && a[0]) {
					selectedActivityId = a[0].id;
					allocatePoints = Number(a[0].default_points);
				}
				const nextSelected: Record<string, boolean> = {};
				for (const person of p) {
					nextSelected[person.id] = untrack(() => selectedIds[person.id]) ?? false;
				}
				selectedIds = nextSelected;
			} catch (err) {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			} finally {
				if (!cancelled) loading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function onActivityChange() {
		const activity = activities.find((a) => a.id === selectedActivityId);
		if (activity) allocatePoints = Number(activity.default_points);
	}

	function toggleAll(checked: boolean) {
		const next: Record<string, boolean> = {};
		for (const p of participants) next[p.id] = checked;
		selectedIds = next;
	}

	async function refreshLedger() {
		ledger = await fetchLedger();
	}

	async function allocateToSelected(e: Event) {
		e.preventDefault();
		error = '';
		allocateSuccess = '';

		if (!selectedActivity) {
			error = 'Choose an activity first.';
			return;
		}
		if (!checkedParticipants.length) {
			error = 'Check at least one participant.';
			return;
		}

		const points = Number(allocatePoints);
		if (Number.isNaN(points) || points === 0) {
			error = 'Points must be a non-zero number.';
			return;
		}
		if (points < 0 && !selectedActivity.allow_negative) {
			error = `"${selectedActivity.title}" does not allow negative points.`;
			return;
		}

		saving = true;
		try {
			const note =
				allocateNote.trim() ||
				`Allocated for ${selectedActivity.title}`;

			await Promise.all(
				checkedParticipants.map((p) =>
					insertLedgerEntry({
						participant_id: p.id,
						activity_id: selectedActivity.id,
						points,
						note
					})
				)
			);

			allocateSuccess = `Added ${points > 0 ? '+' : ''}${points.toFixed(1)} pts to ${checkedParticipants.length} participant${checkedParticipants.length === 1 ? '' : 's'}.`;
			allocateNote = '';
			toggleAll(false);
			await refreshLedger();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function runAiParse() {
		aiError = '';
		aiPreview = null;
		if (!aiText.trim()) {
			aiError = 'Enter a natural language log first.';
			return;
		}
		aiLoading = true;
		try {
			aiPreview = await parsePointsWithAi(
				aiText.trim(),
				participants.map(({ id, name }) => ({ id, name })),
				activities.map(({ id, title, default_points, allow_negative }) => ({
					id,
					title,
					default_points: Number(default_points),
					allow_negative
				}))
			);
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
		} finally {
			aiLoading = false;
		}
	}

	async function confirmAiPreview() {
		if (!aiPreview) return;
		saving = true;
		error = '';
		aiError = '';
		try {
			const activity = activities.find((a) => a.id === aiPreview!.activity_id);
			if (aiPreview.points < 0 && !activity?.allow_negative) {
				throw new Error('This activity does not allow negative points.');
			}
			await insertLedgerEntry({
				participant_id: aiPreview.participant_id,
				activity_id: aiPreview.activity_id,
				points: aiPreview.points,
				note: aiText.trim()
			});
			aiText = '';
			aiPreview = null;
			await refreshLedger();
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function redeemReward(reward: GrandReward) {
		if (!activeParticipant) return;
		if (totalBalance < Number(reward.points_required)) {
			error = 'Not enough points to claim this reward.';
			return;
		}
		saving = true;
		error = '';
		try {
			await claimGrandReward(activeParticipant.id, reward);
			await refreshLedger();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}
</script>

<section class="dash">
	<header class="dash__header">
		<div>
			<p class="eyebrow">Dashboard</p>
			<h1>Points &amp; Progress</h1>
		</div>

		{#if participants.length}
			<label class="participant-pick">
				<span>Vault / metrics participant</span>
				<select bind:value={activeParticipantId}>
					{#each participants as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
		{/if}
	</header>

	{#if loading}
		<p class="muted">Loading dashboard…</p>
	{:else if !participants.length}
		<p class="muted">
			Add participants, activities, and rewards from the nav to get started.
		</p>
	{:else}
		{#if error}
			<p class="alert" role="alert">{error}</p>
		{/if}
		{#if allocateSuccess}
			<p class="ok" role="status">{allocateSuccess}</p>
		{/if}

		<div class="metrics">
			<div class="metric">
				<span class="metric__label">Today</span>
				<strong class="metric__value">{dailyTotal.toFixed(1)}</strong>
			</div>
			<div class="metric">
				<span class="metric__label">This week</span>
				<strong class="metric__value">{weeklyTotal.toFixed(1)}</strong>
			</div>
			<div class="metric metric--accent">
				<span class="metric__label">Balance</span>
				<strong class="metric__value">{totalBalance.toFixed(1)}</strong>
			</div>
		</div>

		<div class="dash__grid">
			<div class="panel panel--vault">
				<RewardVault balance={totalBalance} {targetPoints} class="h-full min-h-[280px]" />
				{#if nextReward}
					<p class="vault-hint">
						Next goal: <strong>{nextReward.title}</strong> · {Number(
							nextReward.points_required
						).toFixed(1)} pts
					</p>
				{/if}
			</div>

			<form class="panel" onsubmit={allocateToSelected}>
				<h2>Allocate points</h2>
				<p class="panel__lede">
					Pick an activity, set points, then check who should receive them.
				</p>

				<label class="field">
					<span>Activity</span>
					<select bind:value={selectedActivityId} onchange={onActivityChange} required>
						{#each activities as a (a.id)}
							<option value={a.id}>
								{a.title} ({Number(a.default_points).toFixed(1)} pts{#if a.allow_negative}, ±{/if})
							</option>
						{:else}
							<option value="" disabled>No activities yet</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span>Points</span>
					<input bind:value={allocatePoints} type="number" step="0.1" required />
					{#if selectedActivity && !selectedActivity.allow_negative}
						<span class="hint">Negative values are blocked for this activity.</span>
					{/if}
				</label>

				<div class="field">
					<div class="check-head">
						<span>Participants</span>
						<button
							type="button"
							class="link"
							onclick={() => toggleAll(!allSelected)}
						>
							{allSelected ? 'Clear all' : 'Select all'}
						</button>
					</div>
					<ul class="check-list">
						{#each participants as p (p.id)}
							<li>
								<label class="check-row">
									<input type="checkbox" bind:checked={selectedIds[p.id]} />
									<span class="swatch" style={`background:${p.avatar_color}`}></span>
									<span>{p.name}</span>
								</label>
							</li>
						{/each}
					</ul>
				</div>

				<label class="field">
					<span>Note <em>(optional)</em></span>
					<input bind:value={allocateNote} type="text" placeholder="Finished chores early" />
				</label>

				<button
					type="submit"
					class="btn"
					disabled={saving || !activities.length || !checkedParticipants.length}
				>
					{saving
						? 'Saving…'
						: `Allocate to ${checkedParticipants.length || 0} selected`}
				</button>
			</form>
		</div>

		<div class="dash__grid dash__grid--lower">
			<div class="panel">
				<h2>Grand rewards</h2>
				<ul class="list">
					{#each rewards as reward (reward.id)}
						<li>
							<div>
								<strong>{reward.title}</strong>
								<span class="muted">{Number(reward.points_required).toFixed(1)} pts</span>
							</div>
							<button
								type="button"
								class="btn btn--sm"
								disabled={saving || totalBalance < Number(reward.points_required)}
								onclick={() => redeemReward(reward)}
							>
								Claim
							</button>
						</li>
					{:else}
						<li class="muted">No rewards yet.</li>
					{/each}
				</ul>
			</div>

			<div class="panel">
				<h2>Recent ledger</h2>
				<ul class="list list--ledger">
					{#each participantLedger.slice(0, 8) as entry (entry.id)}
						<li>
							<span class:points-neg={entry.points < 0} class:points-pos={entry.points > 0}>
								{Number(entry.points) > 0 ? '+' : ''}{Number(entry.points).toFixed(1)}
							</span>
							<span class="ledger-note">{entry.note || '—'}</span>
							<time datetime={entry.created_at}>
								{new Date(entry.created_at).toLocaleString()}
							</time>
						</li>
					{:else}
						<li class="muted">No ledger entries yet.</li>
					{/each}
				</ul>
			</div>
		</div>

		<details class="ai-promo">
			<summary>
				<span class="ai-promo__eyebrow">Optional</span>
				<span class="ai-promo__title">Please try our AI capability</span>
				<span class="ai-promo__lede">
					Describe a points event in plain English — we’ll propose a ledger entry for you to confirm.
				</span>
			</summary>

			<div class="ai-promo__body">
				<textarea
					bind:value={aiText}
					rows="3"
					placeholder="Gave Sarah 2.5 points for washing the car"
				></textarea>

				<div class="row">
					<button type="button" class="btn btn--ghost" disabled={aiLoading} onclick={runAiParse}>
						{aiLoading ? 'Parsing…' : 'Parse with AI'}
					</button>
					{#if aiPreview}
						<button type="button" class="btn btn--ghost" onclick={() => (aiPreview = null)}>
							Clear preview
						</button>
					{/if}
				</div>

				{#if aiError}
					<p class="alert" role="alert">{aiError}</p>
				{/if}

				{#if aiPreview}
					<div class="preview" aria-live="polite">
						<p class="preview__title">Confirm before saving</p>
						<ul>
							<li>
								Participant:
								<strong>{previewParticipant?.name ?? aiPreview.participant_id}</strong>
							</li>
							<li>
								Activity:
								<strong>{previewActivity?.title ?? aiPreview.activity_id}</strong>
							</li>
							<li>
								Points: <strong>{aiPreview.points}</strong>
							</li>
						</ul>
						<button
							type="button"
							class="btn btn--accent"
							disabled={saving}
							onclick={confirmAiPreview}
						>
							{saving ? 'Saving…' : 'Confirm & write to ledger'}
						</button>
					</div>
				{/if}
			</div>
		</details>
	{/if}
</section>

<style>
	.dash {
		display: grid;
		gap: 1.5rem;
	}

	.dash__header {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.dash__header h1 {
		margin: 0.15rem 0 0;
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		letter-spacing: -0.03em;
		color: var(--text);
	}

	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}

	.participant-pick,
	.field {
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.participant-pick select,
	.field select,
	.field input,
	textarea {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.65rem 0.8rem;
		font: inherit;
		width: 100%;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--amber);
	}

	.field em {
		font-style: normal;
		opacity: 0.65;
	}

	.check-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.link {
		border: none;
		background: transparent;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		padding: 0;
	}

	.check-list {
		list-style: none;
		margin: 0.35rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
		max-height: 11rem;
		overflow: auto;
	}

	.check-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.55rem;
		border-radius: 0.65rem;
		background: var(--surface-solid);
		border: 1px solid var(--border);
		cursor: pointer;
		color: var(--text);
		font-size: 0.92rem;
	}

	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.metric {
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}

	.metric--accent {
		background: linear-gradient(145deg, rgba(20, 184, 166, 0.18), rgba(245, 158, 11, 0.1));
		border-color: rgba(180, 83, 9, 0.22);
	}

	.metric__label {
		display: block;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-soft);
	}

	.metric__value {
		font-family: var(--font-display);
		font-size: 1.75rem;
		color: var(--text);
	}

	.dash__grid {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1rem;
	}

	.dash__grid--lower {
		grid-template-columns: 1fr 1.2fr;
	}

	.panel {
		padding: 1.15rem 1.2rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		display: grid;
		gap: 0.75rem;
		align-content: start;
	}

	.panel--vault {
		padding: 0.65rem;
	}

	.panel h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--text);
	}

	.panel__lede,
	.muted,
	.vault-hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.vault-hint {
		padding: 0.35rem 0.5rem 0.55rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.btn {
		border: none;
		border-radius: 0.75rem;
		padding: 0.65rem 0.95rem;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--accent-bright);
		color: #042f2e;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn--ghost {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
	}

	.btn--accent {
		background: linear-gradient(135deg, #f59e0b, #fbbf24);
		color: #451a03;
	}

	.btn--sm {
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
	}

	.preview {
		border-radius: 0.9rem;
		padding: 0.85rem;
		background: var(--ok-bg);
		border: 1px solid rgba(16, 185, 129, 0.35);
		display: grid;
		gap: 0.55rem;
	}

	.preview__title {
		margin: 0;
		font-weight: 700;
		color: var(--ok-text);
	}

	.preview ul,
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.55rem;
	}

	.list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}

	.list--ledger li {
		display: grid;
		grid-template-columns: 4rem 1fr auto;
		align-items: baseline;
	}

	.ledger-note {
		color: var(--text);
		font-size: 0.9rem;
	}

	time {
		font-size: 0.75rem;
		color: var(--text-soft);
	}

	.points-pos {
		color: #047857;
		font-weight: 700;
	}

	.points-neg {
		color: var(--amber);
		font-weight: 700;
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

	.ai-promo {
		border-radius: 1.15rem;
		border: 1px dashed var(--border-strong);
		background: rgba(255, 255, 255, 0.55);
		padding: 0.25rem 0.35rem 0.35rem;
	}

	.ai-promo summary {
		list-style: none;
		cursor: pointer;
		padding: 0.9rem 1rem;
		display: grid;
		gap: 0.25rem;
	}

	.ai-promo summary::-webkit-details-marker {
		display: none;
	}

	.ai-promo__eyebrow {
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-soft);
		font-family: var(--font-display);
	}

	.ai-promo__title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--text);
	}

	.ai-promo__lede {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.ai-promo__body {
		display: grid;
		gap: 0.75rem;
		padding: 0 1rem 1rem;
	}

	@media (max-width: 900px) {
		.metrics,
		.dash__grid,
		.dash__grid--lower {
			grid-template-columns: 1fr;
		}

		.list--ledger li {
			grid-template-columns: 3.5rem 1fr;
		}

		.list--ledger time {
			grid-column: 2;
		}
	}
</style>
