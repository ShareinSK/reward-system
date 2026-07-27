<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RewardVault from '$lib/components/RewardVault.svelte';
	import {
		claimGrandReward,
		fetchGrandRewards,
		fetchLedger,
		fetchParticipants
	} from '$lib/api';
	import { ensureHouseholdId, fetchHouseholdSettings } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import {
		balanceForParticipant,
		filterSince,
		startOfLocalDay,
		startOfLocalWeek,
		sumPoints
	} from '$lib/points';
	import { formatPoints, settingsFromHousehold } from '$lib/settings';
	import { supabase } from '$lib/supabase';
	import type { GrandReward, HouseholdSettings, Participant, PointsLedgerEntry } from '$lib/types';
	import { DEFAULT_HOUSEHOLD_SETTINGS } from '$lib/types';

	let loading = $state(true);
	let error = $state('');
	let saving = $state(false);

	let participant = $state<Participant | null>(null);
	let rewards = $state<GrandReward[]>([]);
	let ledger = $state<PointsLedgerEntry[]>([]);
	let settings = $state<HouseholdSettings>({ ...DEFAULT_HOUSEHOLD_SETTINGS });

	const participantId = $derived(page.params.id ?? '');
	const decimals = $derived(settings.allow_decimal_points);

	const participantLedger = $derived(
		participant ? ledger.filter((e) => e.participant_id === participant!.id) : []
	);
	const totalBalance = $derived(
		participant ? balanceForParticipant(ledger, participant.id) : 0
	);
	const dailyTotal = $derived(sumPoints(filterSince(participantLedger, startOfLocalDay())));
	const weeklyTotal = $derived(sumPoints(filterSince(participantLedger, startOfLocalWeek())));

	const nextReward = $derived.by(() => {
		const ordered = [...rewards].sort(
			(a, b) => Number(a.points_required) - Number(b.points_required)
		);
		return (
			ordered.find((r) => Number(r.points_required) > totalBalance) ??
			ordered[ordered.length - 1] ??
			null
		);
	});

	const targetPoints = $derived(nextReward ? Number(nextReward.points_required) : 100);

	$effect(() => {
		const id = participantId;
		let cancelled = false;

		(async () => {
			loading = true;
			error = '';
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(resolve('/'), { replaceState: true });
				return;
			}
			if (!id) {
				error = 'Missing participant.';
				loading = false;
				return;
			}
			try {
				const hid = await ensureHouseholdId();
				setActiveHouseholdId(hid);
				const [people, rewardList, entries, s] = await Promise.all([
					fetchParticipants(),
					fetchGrandRewards(),
					fetchLedger(500),
					fetchHouseholdSettings(hid)
				]);
				if (cancelled) return;
				settings = settingsFromHousehold(s);
				const found = people.find((p) => p.id === id) ?? null;
				if (!found) {
					error = 'Participant not found.';
					participant = null;
				} else {
					participant = found;
					rewards = rewardList;
					ledger = entries;
				}
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

	async function redeemReward(reward: GrandReward) {
		if (!participant) return;
		if (totalBalance < Number(reward.points_required)) {
			error = 'Not enough points to claim this reward.';
			return;
		}
		saving = true;
		error = '';
		try {
			await claimGrandReward(participant.id, reward);
			ledger = await fetchLedger(500);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}
</script>

<section class="page">
	<a class="back" href={resolve('/dashboard/')}>← Leaderboard</a>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if !participant}
		<p class="alert" role="alert">{error || 'Participant not found.'}</p>
	{:else}
		<header class="header">
			<span class="swatch" style={`background:${participant.avatar_color}`}></span>
			<div>
				<p class="eyebrow">Participant</p>
				<h1>{participant.name}</h1>
			</div>
		</header>

		{#if error}
			<p class="alert" role="alert">{error}</p>
		{/if}

		<div class="metrics">
			<div class="metric">
				<span class="metric__label">Today</span>
				<strong class="metric__value">{formatPoints(dailyTotal, decimals)}</strong>
			</div>
			<div class="metric">
				<span class="metric__label">This week</span>
				<strong class="metric__value">{formatPoints(weeklyTotal, decimals)}</strong>
			</div>
			<div class="metric metric--accent">
				<span class="metric__label">Balance</span>
				<strong class="metric__value">{formatPoints(totalBalance, decimals)}</strong>
			</div>
		</div>

		<div class="grid">
			<div class="panel panel--vault">
				<RewardVault balance={totalBalance} {targetPoints} class="h-full min-h-[280px]" />
				{#if nextReward}
					<p class="vault-hint">
						Next goal: <strong>{nextReward.title}</strong> ·
						{formatPoints(Number(nextReward.points_required), decimals)} pts
					</p>
				{/if}
			</div>

			<div class="panel">
				<h2>Grand rewards</h2>
				<ul class="list">
					{#each rewards as reward (reward.id)}
						<li>
							<div>
								<strong>{reward.title}</strong>
								<span class="muted"
									>{formatPoints(Number(reward.points_required), decimals)} pts</span
								>
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
		</div>

		<div class="panel">
			<h2>History</h2>
			<ul class="list list--ledger">
				{#each participantLedger as entry (entry.id)}
					<li>
						<span class:points-neg={entry.points < 0} class:points-pos={entry.points > 0}>
							{formatPoints(Number(entry.points), decimals, { signed: true })}
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
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1.25rem;
	}

	.back {
		justify-self: start;
		color: var(--accent);
		text-decoration: none;
		font-size: 0.9rem;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.header h1 {
		margin: 0.15rem 0 0;
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 3vw, 2rem);
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

	.swatch {
		width: 1.15rem;
		height: 1.15rem;
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

	.grid {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1rem;
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

	.muted,
	.vault-hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.vault-hint {
		padding: 0.35rem 0.5rem 0.55rem;
	}

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

	.btn--sm {
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
	}

	.alert {
		margin: 0;
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
		background: var(--danger-bg);
		color: var(--danger-text);
	}

	@media (max-width: 900px) {
		.metrics,
		.grid {
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
