<script lang="ts">
	import { fetchActivities } from '$lib/api';
	import { ensureHouseholdId } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { Activity } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let activities = $state<Activity[]>([]);
	let title = $state('');
	let defaultPoints = $state(1);
	let allowNegative = $state(false);
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
			activities = await fetchActivities();
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
		const {
			data: { user }
		} = await supabase.auth.getUser();
		const household_id = await ensureHouseholdId();
		setActiveHouseholdId(household_id);
		const { error: insertError } = await supabase.from('activities').insert({
			title: title.trim(),
			default_points: defaultPoints,
			allow_negative: allowNegative,
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
	</header>

	<form class="form" onsubmit={addActivity}>
		<label>
			<span>Title</span>
			<input bind:value={title} required placeholder="Washing the car" />
		</label>
		<label>
			<span>Default points</span>
			<input bind:value={defaultPoints} type="number" step="0.1" required />
		</label>
		<label class="check">
			<input bind:checked={allowNegative} type="checkbox" />
			<span>Allow negative</span>
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
			{#each activities as a (a.id)}
				<li>
					<div>
						<strong>{a.title}</strong>
						<span class="muted"
							>{Number(a.default_points).toFixed(1)} pts
							{#if a.allow_negative}· negatives OK{/if}</span
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
