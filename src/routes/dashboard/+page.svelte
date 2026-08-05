<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		fetchActivities,
		fetchLedger,
		fetchParticipants,
		insertLedgerEntry,
		parsePointsWithAi
	} from '$lib/api';
	import {
		ensureHouseholdId,
		fetchHouseholdSettings
	} from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import {
		enqueuePendingAwards,
		flushPendingAwards,
		isNetworkLikeError,
		listPendingAwards,
		loadDashboardCache,
		newClientRequestId,
		saveDashboardCache,
		type PendingAward
	} from '$lib/offlineAwards';
	import {
		balanceForParticipant,
		filterSince,
		startOfLocalDay,
		startOfLocalWeek,
		sumPoints
	} from '$lib/points';
	import {
		formatPoints,
		normalizePoints,
		pointsInputHint,
		pointsStep,
		settingsFromHousehold
	} from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type {
		Activity,
		AiLogPreview,
		HouseholdSettings,
		Participant,
		PointsLedgerEntry
	} from '$lib/types';
	import { DEFAULT_HOUSEHOLD_SETTINGS } from '$lib/types';
	import { untrack } from 'svelte';

	let loading = $state(true);
	let error = $state('');
	let saving = $state(false);
	let allocateSuccess = $state('');
	let pendingCount = $state(0);
	let syncing = $state(false);
	let householdId = $state('');

	let activities = $state<Activity[]>([]);
	let participants = $state<Participant[]>([]);
	let ledger = $state<PointsLedgerEntry[]>([]);
	let settings = $state<HouseholdSettings>({ ...DEFAULT_HOUSEHOLD_SETTINGS });

	let selectedActivityId = $state('');
	let allocatePoints = $state(1);
	let allocateNote = $state('');
	let selectedIds = $state<Record<string, boolean>>({});

	let aiText = $state('');
	let aiLoading = $state(false);
	let aiPreview = $state<AiLogPreview | null>(null);
	let aiError = $state('');

	const step = $derived(pointsStep(settings.allow_decimal_points));
	const inputHint = $derived(pointsInputHint(settings));

	type LeaderRow = {
		participant: Participant;
		balance: number;
		daily: number;
		weekly: number;
		rank: number;
	};

	const leaderboard = $derived.by(() => {
		const rows: Omit<LeaderRow, 'rank'>[] = participants.map((participant) => {
			const entries = ledger.filter((e) => e.participant_id === participant.id);
			return {
				participant,
				balance: balanceForParticipant(ledger, participant.id),
				daily: sumPoints(filterSince(entries, startOfLocalDay())),
				weekly: sumPoints(filterSince(entries, startOfLocalWeek()))
			};
		});
		rows.sort((a, b) => b.balance - a.balance);
		return rows.map((row, i) => ({ ...row, rank: i + 1 }));
	});

	const selectedActivity = $derived(
		activities.find((a) => a.id === selectedActivityId) ?? null
	);
	const awardableParticipants = $derived(
		selectedActivity?.assignee_participant_id
			? participants.filter((p) => p.id === selectedActivity.assignee_participant_id)
			: participants
	);
	const checkedParticipants = $derived(awardableParticipants.filter((p) => selectedIds[p.id]));
	const allSelected = $derived(
		awardableParticipants.length > 0 && awardableParticipants.every((p) => selectedIds[p.id])
	);
	const previewParticipant = $derived(
		aiPreview ? participants.find((p) => p.id === aiPreview!.participant_id) : null
	);
	const previewActivity = $derived(
		aiPreview ? activities.find((a) => a.id === aiPreview!.activity_id) : null
	);

	async function refreshPending(hid = householdId) {
		if (!hid) {
			pendingCount = 0;
			return;
		}
		pendingCount = (await listPendingAwards(hid)).length;
	}

	async function syncPending(hid = householdId) {
		if (!hid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
			await refreshPending(hid);
			return;
		}
		syncing = true;
		try {
			const result = await flushPendingAwards(hid);
			pendingCount = result.remaining;
			if (result.flushed > 0) {
				try {
					ledger = await fetchLedger();
				} catch {
					/* keep optimistic */
				}
			}
			if (result.error && result.remaining > 0) {
				error = result.error;
			}
		} finally {
			syncing = false;
		}
	}

	$effect(() => {
		let cancelled = false;

		(async () => {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(resolve('/'), { replaceState: true });
				return;
			}
			try {
				const hid = await ensureHouseholdId();
				if (cancelled) return;
				householdId = hid;
				setActiveHouseholdId(hid);

				try {
					const [a, p, l, s] = await Promise.all([
						fetchActivities(),
						fetchParticipants(),
						fetchLedger(),
						fetchHouseholdSettings(hid)
					]);
					if (cancelled) return;
					activities = a;
					participants = p;
					ledger = l;
					settings = settingsFromHousehold(s);
					try {
						await saveDashboardCache({
							household_id: hid,
							activities: a,
							participants: p,
							settings,
							saved_at: new Date().toISOString()
						});
					} catch {
						/* offline cache is best-effort */
					}
				} catch (err) {
					const cache = await loadDashboardCache(hid);
					if (cache) {
						activities = cache.activities;
						participants = cache.participants;
						settings = cache.settings;
						error = isNetworkLikeError(err)
							? 'Offline — using cached quests. Awards will sync when you reconnect.'
							: err instanceof Error
								? err.message
								: String(err);
					} else {
						throw err;
					}
				}

				if (!untrack(() => selectedActivityId) && activities[0]) {
					selectedActivityId = activities[0].id;
					allocatePoints = settings.allow_decimal_points
						? Number(activities[0].default_points)
						: Math.round(Number(activities[0].default_points));
				}
				const nextSelected: Record<string, boolean> = {};
				for (const person of participants) {
					nextSelected[person.id] = untrack(() => selectedIds[person.id]) ?? false;
				}
				selectedIds = nextSelected;
				await refreshPending(hid);
				await syncPending(hid);
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

	$effect(() => {
		if (typeof window === 'undefined') return;
		const onOnline = () => {
			void syncPending();
		};
		window.addEventListener('online', onOnline);
		return () => window.removeEventListener('online', onOnline);
	});

	function onActivityChange() {
		const activity = activities.find((a) => a.id === selectedActivityId);
		if (activity) {
			allocatePoints = settings.allow_decimal_points
				? Number(activity.default_points)
				: Math.round(Number(activity.default_points));
			if (activity.assignee_participant_id) {
				const next: Record<string, boolean> = {};
				for (const p of participants) {
					next[p.id] = p.id === activity.assignee_participant_id;
				}
				selectedIds = next;
			}
		}
	}

	function toggleAll(checked: boolean) {
		const next: Record<string, boolean> = { ...selectedIds };
		for (const p of awardableParticipants) next[p.id] = checked;
		selectedIds = next;
	}

	function openParticipant(id: string) {
		goto(resolve(`/participants/${id}/`));
	}

	async function refreshLedger() {
		ledger = await fetchLedger();
	}

	async function queueOfflineAwards(
		hid: string,
		activityId: string,
		points: number,
		note: string,
		people: Participant[]
	) {
		const pending: PendingAward[] = people.map((p) => ({
			client_request_id: newClientRequestId(),
			participant_id: p.id,
			activity_id: activityId,
			points,
			note,
			household_id: hid,
			created_at_iso: new Date().toISOString()
		}));
		await enqueuePendingAwards(pending);
		ledger = [
			...pending.map((a) => ({
				id: `pending:${a.client_request_id}`,
				participant_id: a.participant_id,
				activity_id: a.activity_id,
				grand_reward_id: null,
				points: a.points,
				note: a.note,
				household_id: a.household_id,
				created_by: null,
				created_at: a.created_at_iso,
				client_request_id: a.client_request_id
			})),
			...ledger
		];
		pendingCount = (await listPendingAwards(hid)).length;
	}

	async function allocateToSelected(e: Event) {
		e.preventDefault();
		error = '';
		allocateSuccess = '';

		if (!selectedActivity) {
			error = 'Choose a quest first.';
			return;
		}
		if (!checkedParticipants.length) {
			error = 'Check at least one questor.';
			return;
		}

		const points = normalizePoints(Number(allocatePoints), settings);
		if (Number.isNaN(points) || points === 0) {
			error = settings.allow_negative_points
				? 'XP must be a non-zero number.'
				: 'XP must be a positive whole number (negatives are off in Guild Stats).';
			return;
		}
		if (points < 0 && !settings.allow_negative_points) {
			error = 'Negative XP is turned off in Guild Stats.';
			return;
		}
		if (points < 0 && !selectedActivity.allow_negative) {
			error = `"${selectedActivity.title}" does not allow negative XP.`;
			return;
		}

		saving = true;
		try {
			const note = allocateNote.trim() || `Awarded for ${selectedActivity.title}`;
			const hid = householdId || (await ensureHouseholdId());
			householdId = hid;
			const people = [...checkedParticipants];
			const activityId = selectedActivity.id;

			if (typeof navigator !== 'undefined' && navigator.onLine === false) {
				await queueOfflineAwards(hid, activityId, points, note, people);
				allocateSuccess = `Saved offline — ${formatPoints(points, settings.allow_decimal_points, { signed: true })} XP for ${people.length} questor${people.length === 1 ? '' : 's'} will sync when you’re back online.`;
				allocateNote = '';
				toggleAll(false);
				return;
			}

			try {
				await Promise.all(
					people.map((p) =>
						insertLedgerEntry({
							participant_id: p.id,
							activity_id: activityId,
							points,
							note,
							client_request_id: newClientRequestId()
						})
					)
				);
			} catch (err) {
				if (!isNetworkLikeError(err)) throw err;
				await queueOfflineAwards(hid, activityId, points, note, people);
				allocateSuccess = 'Saved offline — will sync when you’re back online.';
				allocateNote = '';
				toggleAll(false);
				return;
			}

			allocateSuccess = `Added ${formatPoints(points, settings.allow_decimal_points, { signed: true })} XP to ${people.length} questor${people.length === 1 ? '' : 's'}.`;
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
					allow_negative: settings.allow_negative_points && allow_negative
				}))
			);
			if (aiPreview) {
				aiPreview = {
					...aiPreview,
					points: settings.allow_decimal_points
						? Math.round(Number(aiPreview.points) * 10) / 10
						: Math.round(Number(aiPreview.points))
				};
			}
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
			const points = normalizePoints(aiPreview.points, settings);
			if (Number.isNaN(points) || points === 0) {
				throw new Error('XP must be a non-zero number under current Guild Stats.');
			}
			if (points < 0 && !settings.allow_negative_points) {
				throw new Error('Negative XP is turned off in Guild Stats.');
			}
			if (points < 0 && !activity?.allow_negative) {
				throw new Error('This quest does not allow negative XP.');
			}
			await insertLedgerEntry({
				participant_id: aiPreview.participant_id,
				activity_id: aiPreview.activity_id,
				points,
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
</script>

<section class="dash">
	<header class="dash__header">
		<div>
			<p class="eyebrow">Quest Log</p>
			<h1>Guild Standings</h1>
			<p class="lede">Tap a questor to see their vault, bounties, and full history.</p>
		</div>
	</header>

	{#if loading}
		<p class="muted">Loading quest log…</p>
	{:else if !participants.length}
		<p class="muted">Add questors, quests, and bounties from the nav to get started.</p>
	{:else}
		{#if error}
			<p class="alert" role="alert">{error}</p>
		{/if}
		{#if allocateSuccess}
			<p class="ok" role="status">{allocateSuccess}</p>
		{/if}
		{#if pendingCount > 0}
			<div class="sync-banner" role="status">
				<span
					>{pendingCount} award{pendingCount === 1 ? '' : 's'} waiting to sync{#if syncing}
						…{/if}</span
				>
				<button type="button" class="sync-btn" disabled={syncing} onclick={() => syncPending()}>
					{syncing ? 'Syncing…' : 'Sync now'}
				</button>
			</div>
		{/if}

		<div class="dash__grid">
			<div class="panel panel--board">
				<h2>Standings</h2>
				<ol class="board">
					{#each leaderboard as row (row.participant.id)}
						<li>
							<button
								type="button"
								class="board-row"
								class:board-row--top={row.rank === 1}
								onclick={() => openParticipant(row.participant.id)}
							>
								<span class="rank" aria-label={`Rank ${row.rank}`}>
									{#if row.rank === 1}
										<svg class="trophy" viewBox="0 0 24 24" aria-hidden="true">
											<path
												fill="currentColor"
												d="M7 4h10v2h2.5a1.5 1.5 0 0 1 1.5 1.5V9a4.5 4.5 0 0 1-4.05 4.48A5.01 5.01 0 0 1 13 16.9V18h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-1.1a5.01 5.01 0 0 1-4-3.42A4.5 4.5 0 0 1 3 9V7.5A1.5 1.5 0 0 1 4.5 6H7V4Zm0 4H4.5V9a2.5 2.5 0 0 0 2.05 2.45A4.98 4.98 0 0 1 7 8Zm10 0a4.98 4.98 0 0 1 .45 3.45A2.5 2.5 0 0 0 19.5 9V8H17Z"
											/>
										</svg>
									{:else}
										{row.rank}
									{/if}
								</span>
								<span class="board-row__main">
									<strong>{row.participant.name}</strong>
									<span class="muted"
										>Today {formatPoints(row.daily, settings.allow_decimal_points)} XP · Week
										{formatPoints(row.weekly, settings.allow_decimal_points)} XP</span
									>
								</span>
								<span class="board-row__score"
									>{formatPoints(row.balance, settings.allow_decimal_points)} XP</span
								>
								<span class="board-row__chevron" aria-hidden="true">→</span>
							</button>
						</li>
					{/each}
				</ol>
			</div>

			<form class="panel" onsubmit={allocateToSelected}>
				<h2>Award XP</h2>
				<p class="panel__lede">
					Pick a quest, set XP, then check which questors should receive it.
				</p>

				<label class="field">
					<span>Quest</span>
					<select bind:value={selectedActivityId} onchange={onActivityChange} required>
						{#each activities as a (a.id)}
							<option value={a.id}>
								{a.title} ({formatPoints(Number(a.default_points), settings.allow_decimal_points)} XP{#if settings.allow_negative_points && a.allow_negative}, ±{/if})
							</option>
						{:else}
							<option value="" disabled>No quests yet</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span>XP</span>
					<input
						bind:value={allocatePoints}
						type="number"
						step={step}
						min={settings.allow_negative_points ? undefined : 1}
						required
					/>
					{#if inputHint}
						<span class="hint">{inputHint}</span>
					{:else if selectedActivity && !selectedActivity.allow_negative}
						<span class="hint">Negative values are blocked for this quest.</span>
					{/if}
				</label>

				<div class="field">
					<div class="check-head">
						<span>Questors</span>
						<button type="button" class="link" onclick={() => toggleAll(!allSelected)}>
							{allSelected ? 'Clear all' : 'Select all'}
						</button>
					</div>
					<ul class="check-list">
						{#each awardableParticipants as p (p.id)}
							<li>
								<label class="check-row">
									<input type="checkbox" bind:checked={selectedIds[p.id]} />
									<span class="swatch" style={`background:${p.avatar_color}`}></span>
									<span>{p.name}</span>
								</label>
							</li>
						{/each}
					</ul>
					{#if selectedActivity?.assignee_participant_id}
						<span class="hint">This quest is assigned to one questor.</span>
					{/if}
				</div>

				<label class="field">
					<span>Note <em>(optional)</em></span>
					<input bind:value={allocateNote} type="text" placeholder="Completed ahead of schedule" />
				</label>

				<button
					type="submit"
					class="btn"
					disabled={saving || !activities.length || !checkedParticipants.length}
				>
					{saving
						? 'Saving…'
						: `Award XP to ${checkedParticipants.length || 0} selected`}
				</button>
			</form>
		</div>

		<details class="ai-promo">
			<summary>
				<span class="ai-promo__eyebrow">
					Optional · <span class="ai-promo__badge">Beta</span>
				</span>
				<span class="ai-promo__title">AI quest log helper</span>
				<span class="ai-promo__lede">
					Experimental — results may be wrong. Always review before confirming. Describe an XP
					event in plain English and we’ll propose a ledger entry.
				</span>
			</summary>

			<div class="ai-promo__body">
				<textarea
					bind:value={aiText}
					rows="3"
					placeholder="Gave Alex 2.5 XP for finishing early"
				></textarea>

				<div class="row">
					<button type="button" class="btn btn--ghost" disabled={aiLoading} onclick={runAiParse}>
						{aiLoading ? 'Parsing…' : 'Parse with AI (Beta)'}
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
						<p class="preview__title">Review carefully before saving (Beta)</p>
						<ul>
							<li>
								Questor:
								<strong>{previewParticipant?.name ?? aiPreview.participant_id}</strong>
							</li>
							<li>
								Quest:
								<strong>{previewActivity?.title ?? aiPreview.activity_id}</strong>
							</li>
							<li>
								XP:
								<strong
									>{formatPoints(aiPreview.points, settings.allow_decimal_points, {
										signed: true
									})}</strong
								>
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
		gap: 1.25rem;
	}

	@media (min-width: 640px) {
		.dash {
			gap: 1.5rem;
		}
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

	.lede,
	.panel__lede,
	.muted {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.field {
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.field select,
	.field input,
	textarea {
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
		gap: 0.5rem;
	}

	.link {
		border: none;
		background: transparent;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		padding: 0.5rem;
		min-height: 44px;
		min-width: 44px;
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
		padding: 0.65rem 0.7rem;
		min-height: 44px;
		border-radius: 0.65rem;
		background: var(--surface-solid);
		border: 1px solid var(--border);
		cursor: pointer;
		color: var(--text);
		font-size: 0.92rem;
		transition: transform 0.15s ease;
	}

	.check-row:hover {
		transform: scale(1.02);
	}

	.check-row:active {
		transform: scale(0.95);
	}

	.check-row input {
		width: 1.15rem;
		height: 1.15rem;
		min-width: 1.15rem;
		accent-color: var(--accent);
	}

	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.dash__grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.dash__grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 1024px) {
		.dash__grid {
			grid-template-columns: 1.15fr 1fr;
		}
	}

	.panel {
		padding: 1rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		display: grid;
		gap: 0.75rem;
		align-content: start;
	}

	@media (min-width: 640px) {
		.panel {
			padding: 1.15rem 1.2rem;
		}
	}

	.panel h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--text);
	}

	.board {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}

	.board-row {
		width: 100%;
		display: grid;
		grid-template-columns: 1.75rem 1fr auto;
		align-items: center;
		gap: 0.55rem;
		padding: 0.75rem 0.8rem;
		min-height: 44px;
		border-radius: 0.85rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			transform 0.15s ease;
	}

	.board-row:hover {
		border-color: var(--border-strong);
		transform: scale(1.02);
	}

	.board-row:active {
		transform: scale(0.95);
	}

	.board-row--top {
		background: linear-gradient(145deg, rgba(99, 102, 241, 0.14), rgba(245, 158, 11, 0.12));
		border-color: rgba(245, 158, 11, 0.35);
	}

	.rank {
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--accent);
		font-size: 1rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
	}

	.board-row--top .rank {
		color: var(--amber);
	}

	.trophy {
		width: 1.35rem;
		height: 1.35rem;
		display: block;
	}

	.board-row__main {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.board-row__main strong {
		font-size: 1rem;
		font-family: var(--font-display);
	}

	.board-row__score {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--amber);
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(251, 191, 36, 0.22));
		padding: 0.25rem 0.55rem;
		border-radius: 999px;
		border: 1px solid rgba(245, 158, 11, 0.35);
	}

	.board-row__chevron {
		display: none;
		color: var(--text-soft);
		font-size: 1rem;
	}

	@media (min-width: 640px) {
		.board-row {
			grid-template-columns: 2rem 1fr auto auto;
			gap: 0.65rem;
		}

		.board-row__chevron {
			display: inline;
		}
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.row {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}

	.btn {
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

	.btn:hover:not(:disabled) {
		transform: scale(1.02);
	}

	.btn:active:not(:disabled) {
		transform: scale(0.95);
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
		background: linear-gradient(135deg, var(--amber), var(--amber-soft));
		color: #451a03;
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
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--ok-text);
	}

	.preview ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
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

	.sync-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		margin: 0;
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--text);
		border: 1px solid var(--border);
		font-size: 0.9rem;
	}

	.sync-btn {
		border: none;
		border-radius: 0.65rem;
		padding: 0.45rem 0.75rem;
		min-height: 40px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		background: var(--accent-bright);
		color: var(--accent-ink);
	}

	.sync-btn:disabled {
		opacity: 0.65;
		cursor: wait;
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
		min-height: 44px;
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
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	.ai-promo__badge {
		letter-spacing: 0.08em;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.2);
		color: #b45309;
		border: 1px solid rgba(245, 158, 11, 0.45);
		font-size: 0.65rem;
		font-weight: 700;
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
</style>
