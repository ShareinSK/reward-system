<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { parsePlanLimitError } from '$lib/entitlements';
	import { joinHouseholdByCode } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';

	let code = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	$effect(() => {
		const fromQuery = page.url.searchParams.get('code');
		if (fromQuery && !code) code = fromQuery.toUpperCase();
	});

	$effect(() => {
		let cancelled = false;
		supabase.auth.getSession().then(({ data }) => {
			if (!cancelled && !data.session) {
				const joinCode = code || page.url.searchParams.get('code') || '';
				const next = `${resolve('/join/')}?code=${encodeURIComponent(joinCode)}`;
				goto(`${resolve('/')}?next=${encodeURIComponent(next)}`, { replaceState: true });
			}
		});
		return () => {
			cancelled = true;
		};
	});

	async function join(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		success = '';
		try {
			const hid = await joinHouseholdByCode(code);
			setActiveHouseholdId(hid);
			success = 'Joined! You can now manage this guild’s bounties.';
			setTimeout(() => goto(resolve('/dashboard/'), { replaceState: true }), 700);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const planErr = parsePlanLimitError(msg);
			if (planErr?.resource === 'members') {
				const noun = planErr.limit === 1 ? 'guild mate' : 'guild mates';
				error = `Free plan allows ${planErr.limit} ${noun}. Upgrade to Pro to invite more guild mates.`;
			} else {
				error = planErr?.message ?? msg;
			}
		} finally {
			loading = false;
		}
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Guild</p>
		<h1>Join a guild</h1>
		<p class="lede">
			Enter the invite code from another guild mate to share the same bounty system.
		</p>
	</header>

	<form class="panel" onsubmit={join}>
		<label>
			<span>Invite code</span>
			<input bind:value={code} required placeholder="ABCD1234" autocomplete="off" />
		</label>

		{#if error}
			<p class="alert">{error}</p>
		{/if}
		{#if success}
			<p class="ok">{success}</p>
		{/if}

		<button type="submit" disabled={loading}>
			{loading ? 'Joining…' : 'Join guild'}
		</button>
	</form>
</section>

<style>
	.page {
		display: grid;
		gap: 1.25rem;
		max-width: 28rem;
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
	}
	.panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	@media (min-width: 640px) {
		.panel {
			padding: 1.15rem 1.2rem;
		}
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
		padding: 0.75rem 0.85rem;
		min-height: 44px;
		font: inherit;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		width: 100%;
		box-sizing: border-box;
	}
	button {
		border: none;
		border-radius: 0.75rem;
		padding: 0.75rem 0.95rem;
		min-height: 44px;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: var(--accent-bright);
		color: var(--accent-ink);
		transition: transform 0.15s ease;
	}
	button:hover:not(:disabled) {
		transform: scale(1.02);
	}
	button:active:not(:disabled) {
		transform: scale(0.95);
	}
	button:disabled {
		opacity: 0.6;
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
