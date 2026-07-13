<script lang="ts">
	import { fetchParticipants } from '$lib/api';
	import { ensureHouseholdId } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { Participant } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let participants = $state<Participant[]>([]);
	let name = $state('');
	let color = $state('#14b8a6');
	let error = $state('');
	let loading = $state(true);

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
			setActiveHouseholdId(await ensureHouseholdId());
			participants = await fetchParticipants();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function addParticipant(e: Event) {
		e.preventDefault();
		error = '';
		const {
			data: { user }
		} = await supabase.auth.getUser();
		const household_id = await ensureHouseholdId();
		setActiveHouseholdId(household_id);
		const { error: insertError } = await supabase.from('participants').insert({
			name: name.trim(),
			avatar_color: color,
			created_by: user?.id ?? null,
			household_id
		});
		if (insertError) {
			error = insertError.message;
			return;
		}
		name = '';
		await load();
	}

	async function removeParticipant(id: string) {
		const { error: deleteError } = await supabase.from('participants').delete().eq('id', id);
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
		<h1>Participants</h1>
	</header>

	<form class="form" onsubmit={addParticipant}>
		<label>
			<span>Name</span>
			<input bind:value={name} required placeholder="Sarah" />
		</label>
		<label>
			<span>Color</span>
			<input bind:value={color} type="color" />
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
			{#each participants as p (p.id)}
				<li>
					<span class="swatch" style={`background:${p.avatar_color}`}></span>
					<strong>{p.name}</strong>
					<button type="button" onclick={() => removeParticipant(p.id)}>Remove</button>
				</li>
			{:else}
				<li class="muted">No participants yet.</li>
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
	input:not([type='color']) {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.65rem 0.8rem;
		font: inherit;
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
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.9rem;
		border-radius: 0.9rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	li button {
		margin-left: auto;
		background: var(--surface-strong);
		color: var(--amber);
		border: 1px solid rgba(180, 83, 9, 0.3);
	}
	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 999px;
	}
	.muted {
		color: var(--text-muted);
	}
	.alert {
		color: var(--danger-text);
	}
</style>
