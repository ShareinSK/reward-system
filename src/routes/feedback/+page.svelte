<script lang="ts">
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabase';

	let message = $state('');
	let email = $state('');
	let sent = $state(false);
	let error = $state('');
	let loading = $state(false);

	async function submit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		try {
			const {
				data: { user }
			} = await supabase.auth.getUser();
			const payload = {
				user_id: user?.id ?? null,
				email: email.trim() || user?.email || null,
				message: message.trim(),
				created_at: new Date().toISOString()
			};
			// Soft-launch: store as in-app notification to staff mailbox pattern via notification_log if available
			const { error: insertError } = await supabase.from('notification_log').insert({
				user_id: user?.id ?? null,
				template_key: 'feedback',
				channel: 'in_app',
				status: 'received',
				meta: payload
			});
			if (insertError) {
				// Fallback: open mailto
				const body = encodeURIComponent(
					`${message.trim()}\n\nFrom: ${payload.email ?? 'anonymous'}\nUser: ${payload.user_id ?? 'n/a'}`
				);
				window.location.href = `mailto:feedback@questorlog.app?subject=${encodeURIComponent('QuestorLog feedback')}&body=${body}`;
				sent = true;
				return;
			}
			sent = true;
			message = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}
</script>

<section class="page">
	<header>
		<p class="eyebrow">Community</p>
		<h1>Feedback</h1>
		<p class="lede">
			We’re soft-launching QuestorLog with a community. Tell us what works, what’s confusing, and
			what limits feel too tight.
		</p>
	</header>

	{#if sent}
		<p class="ok">Thanks — your feedback was sent.</p>
		<a href={resolve('/dashboard/')}>Back to dashboard</a>
	{:else}
		<form class="panel" onsubmit={submit}>
			<label>
				<span>Email (optional)</span>
				<input bind:value={email} type="email" placeholder="you@email.com" />
			</label>
			<label>
				<span>Message</span>
				<textarea bind:value={message} required rows="6" placeholder="What should we improve?"></textarea>
			</label>
			{#if error}
				<p class="alert">{error}</p>
			{/if}
			<button type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send feedback'}</button>
		</form>
	{/if}
</section>

<style>
	.page {
		display: grid;
		gap: 1rem;
		max-width: 36rem;
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
		margin: 0.2rem 0 0.35rem;
		font-family: var(--font-display);
	}
	.lede {
		color: var(--text-muted);
		line-height: 1.45;
	}
	.panel {
		display: grid;
		gap: 0.75rem;
		padding: 1.1rem;
		border-radius: 1.1rem;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	input,
	textarea {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		padding: 0.7rem 0.85rem;
		font: inherit;
		background: var(--surface-strong);
		color: var(--text);
	}
	button,
	a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.55rem 1rem;
		border-radius: 999px;
		border: none;
		background: var(--accent);
		color: var(--accent-ink);
		font: inherit;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		width: fit-content;
	}
	.alert {
		background: var(--danger-bg);
		color: var(--danger-text);
		padding: 0.65rem;
		border-radius: 0.75rem;
	}
	.ok {
		background: var(--ok-bg);
		color: var(--ok-text);
		padding: 0.65rem;
		border-radius: 0.75rem;
	}
</style>
