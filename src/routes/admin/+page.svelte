<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fetchFeatureFlags, flagLabel } from '$lib/featureFlags';
	import { adminSetEntitlement, adminSetProfileFlags, fetchMyProfile, isStaffRole } from '$lib/profile';
	import { supabase } from '$lib/supabase';
	import type { AppRole, FeatureFlag, PlanPrice, Profile } from '$lib/types';

	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let me = $state<Profile | null>(null);
	let flags = $state<FeatureFlag[]>([]);
	let prices = $state<PlanPrice[]>([]);
	let profiles = $state<Profile[]>([]);
	let households = $state<{ id: string; name: string; disabled: boolean }[]>([]);

	let grantHouseholdId = $state('');
	let grantPlan = $state<'free' | 'trial' | 'pro'>('pro');
	let grantOverride = $state(true);
	let grantNotes = $state('');

	let flagUserId = $state('');
	let flagRole = $state<AppRole | ''>('');
	let flagIsTest = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) {
				goto(resolve('/'), { replaceState: true });
				return;
			}
			me = await fetchMyProfile();
			if (!isStaffRole(me?.app_role)) {
				goto(resolve('/dashboard/'), { replaceState: true });
				return;
			}

			const [f, p, prof, hh] = await Promise.all([
				fetchFeatureFlags(),
				supabase.from('plan_prices').select('*').order('country_or_region'),
				supabase
					.from('profiles')
					.select(
						'id, display_name, active_household_id, app_role, is_test, email_opt_in, push_opt_in, last_active_at'
					)
					.order('display_name')
					.limit(100),
				supabase.from('households').select('id, name, disabled').order('created_at', { ascending: false }).limit(100)
			]);
			flags = f as FeatureFlag[];
			prices = (p.data ?? []) as PlanPrice[];
			profiles = (prof.data ?? []) as Profile[];
			households = (hh.data ?? []) as { id: string; name: string; disabled: boolean }[];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function toggleFlag(flag: FeatureFlag) {
		error = '';
		const { error: upError } = await supabase
			.from('feature_flags')
			.update({
				enabled: !flag.enabled,
				rollout: !flag.enabled ? (flag.rollout === 'off' ? 'on' : flag.rollout) : flag.rollout,
				updated_at: new Date().toISOString()
			})
			.eq('key', flag.key);
		if (upError) {
			error = upError.message;
			return;
		}
		notice = `${flagLabel(flag)} (${flag.key}) updated.`;
		await load();
	}

	async function setRollout(flag: FeatureFlag, rollout: FeatureFlag['rollout']) {
		const { error: upError } = await supabase
			.from('feature_flags')
			.update({ rollout, enabled: rollout !== 'off', updated_at: new Date().toISOString() })
			.eq('key', flag.key);
		if (upError) {
			error = upError.message;
			return;
		}
		await load();
	}

	async function grantEntitlement(e: Event) {
		e.preventDefault();
		error = '';
		try {
			await adminSetEntitlement({
				householdId: grantHouseholdId.trim(),
				plan: grantPlan,
				adminOverride: grantOverride,
				trialEndsAt:
					grantPlan === 'trial'
						? new Date(Date.now() + 15 * 86400000).toISOString()
						: null,
				notes: grantNotes || null
			});
			notice = 'Entitlement updated.';
			grantNotes = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function saveProfileFlags(e: Event) {
		e.preventDefault();
		error = '';
		try {
			await adminSetProfileFlags({
				userId: flagUserId.trim(),
				appRole: flagRole || null,
				isTest: flagIsTest
			});
			notice = 'Profile flags updated.';
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function toggleHouseholdDisabled(id: string, disabled: boolean) {
		const { error: upError } = await supabase
			.from('households')
			.update({ disabled: !disabled })
			.eq('id', id);
		if (upError) {
			error = upError.message;
			return;
		}
		await load();
	}

	async function savePrice(price: PlanPrice) {
		const { error: upError } = await supabase
			.from('plan_prices')
			.update({
				amount_display: price.amount_display,
				stripe_price_id: price.stripe_price_id,
				active: price.active
			})
			.eq('id', price.id);
		if (upError) {
			error = upError.message;
			return;
		}
		notice = 'Price saved.';
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Staff</p>
		<h1>Admin</h1>
		<p class="lede">
			Signed in as {me?.display_name ?? '…'} ({me?.app_role}). Grant Pro, manage flags, and mark test
			accounts.
		</p>
	</header>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else}
		{#if error}
			<p class="alert">{error}</p>
		{/if}
		{#if notice}
			<p class="ok">{notice}</p>
		{/if}

		<div class="panel">
			<h2>Feature flags</h2>
			<ul class="flags">
				{#each flags as flag (flag.key)}
					<li>
						<div>
							<strong>{flagLabel(flag)}</strong>
							<p class="mono">{flag.key}</p>
							{#if flag.description && flag.description !== flagLabel(flag)}
								<p class="muted">{flag.description}</p>
							{/if}
							<p class="muted">rollout: {flag.rollout} · enabled: {String(flag.enabled)}</p>
						</div>
						<div class="row">
							<button type="button" onclick={() => toggleFlag(flag)}>
								{flag.enabled ? 'Disable' : 'Enable'}
							</button>
							<select
								value={flag.rollout}
								onchange={(e) =>
									setRollout(flag, (e.currentTarget as HTMLSelectElement).value as FeatureFlag['rollout'])}
							>
								<option value="off">off</option>
								<option value="on">on</option>
								<option value="allowlist">allowlist</option>
							</select>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		<form class="panel" onsubmit={grantEntitlement}>
			<h2>Grant / extend entitlement</h2>
			<label>
				<span>Household ID</span>
				<input bind:value={grantHouseholdId} required placeholder="uuid" />
			</label>
			<label>
				<span>Plan</span>
				<select bind:value={grantPlan}>
					<option value="free">free</option>
					<option value="trial">trial (15 days)</option>
					<option value="pro">pro</option>
				</select>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={grantOverride} />
				<span>Admin override (bypass Stripe)</span>
			</label>
			<label>
				<span>Notes</span>
				<input bind:value={grantNotes} placeholder="Community feedback household" />
			</label>
			<button type="submit">Save entitlement</button>
		</form>

		<form class="panel" onsubmit={saveProfileFlags}>
			<h2>User flags</h2>
			<label>
				<span>User ID</span>
				<input bind:value={flagUserId} required placeholder="uuid" list="profile-ids" />
				<datalist id="profile-ids">
					{#each profiles as p}
						<option value={p.id}>{p.display_name}</option>
					{/each}
				</datalist>
			</label>
			{#if me?.app_role === 'super_admin'}
				<label>
					<span>App role</span>
					<select bind:value={flagRole}>
						<option value="">(unchanged)</option>
						<option value="user">user</option>
						<option value="admin">admin</option>
						<option value="super_admin">super_admin</option>
					</select>
				</label>
			{/if}
			<label class="check">
				<input type="checkbox" bind:checked={flagIsTest} />
				<span>Mark as test account</span>
			</label>
			<button type="submit">Save user flags</button>
		</form>

		<div class="panel">
			<h2>Households</h2>
			<ul class="list">
				{#each households as h (h.id)}
					<li>
						<div>
							<strong>{h.name}</strong>
							<p class="mono">{h.id}</p>
							{#if h.disabled}<span class="badge">disabled</span>{/if}
						</div>
						<button type="button" class="ghost" onclick={() => toggleHouseholdDisabled(h.id, h.disabled)}>
							{h.disabled ? 'Enable' : 'Disable'}
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<div class="panel">
			<h2>Plan prices</h2>
			<ul class="list">
				{#each prices as price (price.id)}
					<li class="price-row">
						<strong>{price.country_or_region} / {price.currency}</strong>
						<input bind:value={price.amount_display} placeholder="$4.99" />
						<input bind:value={price.stripe_price_id} placeholder="price_…" />
						<label class="check">
							<input type="checkbox" bind:checked={price.active} />
							active
						</label>
						<button type="button" onclick={() => savePrice(price)}>Save</button>
					</li>
				{/each}
			</ul>
		</div>

		<div class="panel">
			<h2>Recent profiles</h2>
			<ul class="list">
				{#each profiles as p (p.id)}
					<li>
						<div>
							<strong>{p.display_name}</strong>
							<span class="muted">{p.app_role}{p.is_test ? ' · test' : ''}</span>
							<p class="mono">{p.id}</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

<style>
	.page {
		display: grid;
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

	h1,
	h2 {
		font-family: var(--font-display);
	}

	h1 {
		margin: 0.2rem 0 0.35rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 1.1rem;
	}

	.lede,
	.muted {
		color: var(--text-muted);
	}

	.panel {
		padding: 1.1rem;
		border-radius: 1.1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		display: grid;
		gap: 0.65rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.check {
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.5rem;
	}

	input,
	select {
		min-height: 44px;
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		padding: 0.55rem 0.75rem;
		font: inherit;
		background: var(--surface-strong);
		color: var(--text);
	}

	button {
		min-height: 44px;
		border: none;
		border-radius: 999px;
		padding: 0.55rem 1rem;
		background: var(--accent);
		color: var(--accent-ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		width: fit-content;
	}

	button.ghost {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
	}

	.flags,
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}

	.flags li,
	.list li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: var(--text-muted);
		word-break: break-all;
		margin: 0.15rem 0 0;
	}

	.badge {
		display: inline-block;
		margin-top: 0.25rem;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		background: var(--danger-bg);
		color: var(--danger-text);
		font-size: 0.75rem;
	}

	.price-row {
		align-items: center;
	}

	.price-row input {
		min-width: 8rem;
		flex: 1;
	}

	.alert {
		background: var(--danger-bg);
		color: var(--danger-text);
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
	}

	.ok {
		background: var(--ok-bg);
		color: var(--ok-text);
		padding: 0.65rem 0.8rem;
		border-radius: 0.75rem;
	}
</style>
