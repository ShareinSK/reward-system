<script lang="ts">
	import { fetchGrandRewards } from '$lib/api';
	import { ensureHouseholdId } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { GrandReward } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let rewards = $state<GrandReward[]>([]);
	let title = $state('');
	let pointsRequired = $state(50);
	let description = $state('');
	let error = $state('');
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(resolve('/login'), { replaceState: true });
				return;
			}
			setActiveHouseholdId(await ensureHouseholdId());
			rewards = await fetchGrandRewards();
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
		const {
			data: { user }
		} = await supabase.auth.getUser();
		const household_id = await ensureHouseholdId();
		setActiveHouseholdId(household_id);
		const { error: insertError } = await supabase.from('grand_rewards').insert({
			title: title.trim(),
			points_required: pointsRequired,
			description: description.trim(),
			created_by: user?.id ?? null,
			household_id
		});
		if (insertError) {
			error = insertError.message;
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
		<p class="eyebrow">Master lists</p>
		<h1>Grand Rewards</h1>
	</header>

	<form class="form" onsubmit={addReward}>
		<label>
			<span>Title</span>
			<input bind:value={title} required placeholder="Movie night" />
		</label>
		<label>
			<span>Points required</span>
			<input bind:value={pointsRequired} type="number" step="0.1" min="0.1" required />
		</label>
		<label class="grow">
			<span>Description</span>
			<input bind:value={description} placeholder="Optional details" />
		</label>
		<button type="submit">Add</button>
	</form>

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
						<span class="muted">{Number(r.points_required).toFixed(1)} pts</span>
						{#if r.description}
							<p>{r.description}</p>
						{/if}
					</div>
					<button type="button" onclick={() => removeReward(r.id)}>Remove</button>
				</li>
			{:else}
				<li class="muted">No grand rewards yet.</li>
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
	.grow {
		flex: 1 1 12rem;
	}
	input {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.65rem 0.8rem;
		font: inherit;
		width: 100%;
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
		align-items: start;
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
	li p {
		margin: 0.15rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
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
