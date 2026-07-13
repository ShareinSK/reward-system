<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import {
		ensureHouseholdId,
		fetchHousehold,
		fetchHouseholdMembers,
		renameHousehold,
		rotateInviteCode
	} from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { Household, HouseholdMember } from '$lib/types';

	let household = $state<Household | null>(null);
	let members = $state<HouseholdMember[]>([]);
	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let nameDraft = $state('');
	let copied = $state(false);

	const inviteLink = $derived(
		household
			? `${page.url.origin}${base}/join?code=${encodeURIComponent(household.invite_code)}`
			: ''
	);

	async function load() {
		loading = true;
		error = '';
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(`${base}/login`);
				return;
			}
			const hid = await ensureHouseholdId();
			setActiveHouseholdId(hid);
			household = await fetchHousehold(hid);
			nameDraft = household.name;
			members = await fetchHouseholdMembers(hid);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function copyText(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		notice = 'Copied to clipboard.';
		setTimeout(() => {
			copied = false;
		}, 1600);
	}

	async function saveName(e: Event) {
		e.preventDefault();
		if (!household) return;
		error = '';
		try {
			await renameHousehold(household.id, nameDraft);
			household = { ...household, name: nameDraft.trim() };
			notice = 'Household name updated.';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function rotateCode() {
		if (!household) return;
		error = '';
		try {
			const code = await rotateInviteCode();
			household = { ...household, invite_code: code };
			notice = 'Invite code rotated. Old links will stop working.';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Sharing</p>
		<h1>Share management</h1>
		<p class="lede">
			Invite another person to manage the same participants, activities, rewards, and ledger.
			They’ll need to create an account, then open your invite link or enter the code.
		</p>
	</header>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if household}
		{#if error}
			<p class="alert">{error}</p>
		{/if}
		{#if notice}
			<p class="ok">{notice}</p>
		{/if}

		<form class="panel" onsubmit={saveName}>
			<label>
				<span>Household name</span>
				<input bind:value={nameDraft} required />
			</label>
			<button type="submit">Save name</button>
		</form>

		<div class="panel">
			<h2>Invite code</h2>
			<p class="code">{household.invite_code}</p>
			<div class="row">
				<button type="button" onclick={() => copyText(household!.invite_code)}>
					{copied ? 'Copied' : 'Copy code'}
				</button>
				<button type="button" class="ghost" onclick={rotateCode}>Rotate code</button>
			</div>

			<label class="link-field">
				<span>Invite link</span>
				<input readonly value={inviteLink} />
			</label>
			<button type="button" onclick={() => copyText(inviteLink)}>Copy invite link</button>
		</div>

		<div class="panel">
			<h2>Managers</h2>
			<ul>
				{#each members as m (m.user_id)}
					<li>
						<strong>{m.display_name}</strong>
						<span class="muted">{m.role}</span>
					</li>
				{:else}
					<li class="muted">No members yet.</li>
				{/each}
			</ul>
			<p class="muted tip">
				Already have a code from someone else?
				<a href={`${base}/join`}>Join another household</a>
			</p>
		</div>
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
	.lede,
	.muted,
	.tip {
		color: var(--text-muted);
		font-size: 0.95rem;
		margin: 0.35rem 0 0;
	}
	.panel {
		display: grid;
		gap: 0.75rem;
		padding: 1.15rem 1.2rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	.panel h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text);
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	input {
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
		justify-self: start;
	}
	.ghost {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.code {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.8rem;
		letter-spacing: 0.18em;
		color: var(--text);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
	}
	.tip a {
		color: var(--accent);
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
