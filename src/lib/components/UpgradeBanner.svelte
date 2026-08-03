<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		resource = 'items',
		limit = 0,
		billingEnabled = false
	}: {
		resource?: string;
		limit?: number;
		billingEnabled?: boolean;
	} = $props();
</script>

<aside class="upgrade" role="status">
	<p class="upgrade__title">Free plan limit reached</p>
	<p class="upgrade__body">
		You can have up to <strong>{limit}</strong> {resource} on Free.
		{#if billingEnabled}
			Upgrade to Pro for higher limits.
		{:else}
			Pro subscriptions are coming soon — leave feedback if you need more room.
		{/if}
	</p>
	<div class="upgrade__actions">
		{#if billingEnabled}
			<a class="btn" href={resolve('/billing/')}>Upgrade to Pro</a>
		{:else}
			<a class="btn ghost" href={resolve('/feedback/')}>Send feedback</a>
		{/if}
		<a class="link" href={resolve('/billing/')}>View plan details</a>
	</div>
</aside>

<style>
	.upgrade {
		margin: 0.75rem 0 1rem;
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		border: 1px solid var(--border-strong);
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.1));
		box-shadow: var(--shadow);
	}

	.upgrade__title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--text);
	}

	.upgrade__body {
		margin: 0.35rem 0 0.85rem;
		color: var(--text-muted);
		line-height: 1.45;
		font-size: 0.95rem;
	}

	.upgrade__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		align-items: center;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0.55rem 1rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.btn.ghost {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
	}

	.link {
		color: var(--accent-bright);
		font-size: 0.9rem;
	}
</style>
