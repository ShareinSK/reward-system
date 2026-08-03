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
	let color = $state('#6366f1');
	let error = $state('');
	let loading = $state(true);
	let adding = $state(false);

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

	function openAdd() {
		adding = true;
		error = '';
	}

	function closeAdd() {
		adding = false;
		name = '';
		error = '';
	}

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
		adding = false;
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
	<header class="header">
		<div>
			<p class="eyebrow">Master lists</p>
			<h1>Participants</h1>
		</div>
		<button type="button" class="add-btn add-btn--desktop" onclick={openAdd} hidden={adding}>
			<span class="add-btn__plus" aria-hidden="true">+</span>
			Add participant
		</button>
	</header>

	{#if error}
		<p class="alert">{error}</p>
	{/if}

	{#if loading}
		<p class="muted">Loading…</p>
	{:else}
		<ul class="list">
			{#each participants as p (p.id)}
				<li>
					<span class="swatch" style={`background:${p.avatar_color}`}></span>
					<strong>{p.name}</strong>
					<button type="button" class="remove" onclick={() => removeParticipant(p.id)}>
						Remove
					</button>
				</li>
			{:else}
				{#if !adding}
					<li class="muted empty">No participants yet. Tap + to add one.</li>
				{/if}
			{/each}

			{#if adding}
				<li class="add-row">
					<form class="form" onsubmit={addParticipant}>
						<label class="grow">
							<span>Name</span>
							<input bind:value={name} required placeholder="Alex" autofocus />
						</label>
						<div class="form__row">
							<label class="color-field">
								<span>Color</span>
								<input bind:value={color} type="color" />
							</label>
							<div class="form__actions">
								<button type="button" class="ghost" onclick={closeAdd}>Cancel</button>
								<button type="submit">Add</button>
							</div>
						</div>
					</form>
				</li>
			{/if}
		</ul>
	{/if}

	{#if !adding}
		<button
			type="button"
			class="fab"
			onclick={openAdd}
			aria-label="Add participant"
			title="Add participant"
		>
			<span aria-hidden="true">+</span>
		</button>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1.25rem;
		position: relative;
		padding-bottom: 5rem;
	}

	@media (min-width: 768px) {
		.page {
			padding-bottom: 0;
		}
	}

	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
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

	.add-btn {
		display: none;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--border-strong);
		border-radius: 0.85rem;
		padding: 0.7rem 1rem;
		min-height: 44px;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--surface-strong);
		color: var(--accent);
		box-shadow: var(--shadow);
		transition: transform 0.15s ease, background 0.15s ease;
		flex-shrink: 0;
	}

	.add-btn__plus {
		font-size: 1.25rem;
		line-height: 1;
		font-weight: 700;
		color: var(--accent);
	}

	.add-btn:hover {
		transform: scale(1.02);
		background: rgba(99, 102, 241, 0.08);
	}

	.add-btn:active {
		transform: scale(0.95);
	}

	@media (min-width: 768px) {
		.add-btn--desktop {
			display: inline-flex;
		}

		.add-btn--desktop[hidden] {
			display: none;
		}
	}

	.fab {
		position: fixed;
		right: 1rem;
		bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
		z-index: 25;
		width: 3.5rem;
		height: 3.5rem;
		min-width: 44px;
		min-height: 44px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface-strong);
		color: var(--accent);
		box-shadow: 0 10px 24px rgba(99, 102, 241, 0.16);
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease, background 0.15s ease;
	}

	.fab:hover {
		transform: scale(1.05);
		background: rgba(99, 102, 241, 0.08);
	}

	.fab:active {
		transform: scale(0.95);
	}

	@media (min-width: 768px) {
		.fab {
			display: none;
		}
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	.list > li {
		display: flex;
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

	.list > li:not(.add-row):not(.empty):hover {
		transform: scale(1.02);
	}

	.list > li:not(.add-row):not(.empty):active {
		transform: scale(0.98);
	}

	.list strong {
		font-family: var(--font-display);
	}

	.remove {
		margin-left: auto;
		border: 1px solid rgba(245, 158, 11, 0.35);
		border-radius: 0.75rem;
		padding: 0.7rem 0.95rem;
		min-height: 44px;
		min-width: 44px;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--surface-strong);
		color: var(--amber);
		transition: transform 0.15s ease;
	}

	.remove:hover {
		transform: scale(1.02);
	}

	.remove:active {
		transform: scale(0.95);
	}

	.add-row {
		display: block !important;
		padding: 0.65rem 0.75rem !important;
		background: linear-gradient(145deg, rgba(99, 102, 241, 0.08), rgba(245, 158, 11, 0.06)) !important;
		border-color: var(--border-strong) !important;
	}

	@media (min-width: 640px) {
		.add-row {
			padding: 0.85rem 1rem !important;
		}
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		align-items: stretch;
	}

	@media (min-width: 640px) {
		.form {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: end;
			gap: 0.65rem;
		}
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0;
		font-size: 0.68rem;
		line-height: 1;
		color: var(--text-muted);
	}

	label span {
		margin: 0 0 0.1rem;
		padding: 0;
		line-height: 1;
	}

	@media (min-width: 640px) {
		label {
			gap: 0.2rem;
			font-size: 0.8rem;
		}

		label span {
			margin: 0;
		}
	}

	.grow {
		flex: 1 1 12rem;
	}

	.form__row {
		display: flex;
		align-items: end;
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.form__row {
			display: contents;
		}
	}

	.color-field {
		flex-shrink: 0;
	}

	input:not([type='color']) {
		border-radius: 0.65rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.45rem 0.7rem;
		min-height: 36px;
		height: 36px;
		font: inherit;
		font-size: 0.95rem;
		width: 100%;
		box-sizing: border-box;
	}

	@media (min-width: 640px) {
		input:not([type='color']) {
			padding: 0.6rem 0.8rem;
			min-height: 42px;
			height: auto;
			border-radius: 0.75rem;
		}
	}

	input[type='color'] {
		width: 36px;
		height: 36px;
		min-width: 36px;
		min-height: 36px;
		padding: 0.1rem;
		border-radius: 0.55rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		cursor: pointer;
	}

	@media (min-width: 640px) {
		input[type='color'] {
			width: 42px;
			height: 42px;
			min-width: 42px;
			min-height: 42px;
			border-radius: 0.65rem;
		}
	}

	.form__actions {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.4rem;
		align-items: end;
		margin-left: auto;
	}

	.form button {
		border: none;
		border-radius: 0.65rem;
		padding: 0.45rem 0.75rem;
		min-height: 36px;
		min-width: 36px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		background: var(--accent-bright);
		color: var(--accent-ink);
		transition: transform 0.15s ease;
	}

	@media (min-width: 640px) {
		.form button {
			padding: 0.6rem 0.9rem;
			min-height: 42px;
			min-width: 42px;
			border-radius: 0.75rem;
			font-size: 1rem;
		}
	}

	.form button:hover {
		transform: scale(1.02);
	}

	.form button:active {
		transform: scale(0.95);
	}

	.ghost {
		background: var(--surface-strong) !important;
		color: var(--accent) !important;
		border: 1px solid var(--border-strong) !important;
	}

	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 999px;
	}

	.muted,
	.empty {
		color: var(--text-muted);
	}

	.empty {
		justify-content: center;
		box-shadow: none !important;
		background: transparent !important;
		border-style: dashed !important;
	}

	.alert {
		color: var(--danger-text);
		margin: 0;
	}
</style>
