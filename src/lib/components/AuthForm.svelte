<script lang="ts">
	import { supabase } from '$lib/supabase';

	interface Props {
		onAuthenticated?: () => void;
	}

	let { onAuthenticated }: Props = $props();

	let mode = $state<'login' | 'signup'>('login');
	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let loading = $state(false);
	let message = $state('');
	let error = $state('');

	async function submit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		message = '';

		try {
			if (mode === 'signup') {
				const { error: signUpError } = await supabase.auth.signUp({
					email,
					password,
					options: { data: { display_name: displayName || email.split('@')[0] } }
				});
				if (signUpError) throw signUpError;
				message = 'Check your email to confirm your account, then sign in.';
				mode = 'login';
			} else {
				const { error: signInError } = await supabase.auth.signInWithPassword({
					email,
					password
				});
				if (signInError) throw signInError;
				onAuthenticated?.();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}
</script>

<form class="auth-card" onsubmit={submit}>
	<div class="auth-card__brand">
		<p class="eyebrow">Reward System</p>
		<h1>{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
		<p class="lede">Track family activities, points, and grand rewards together.</p>
	</div>

	{#if mode === 'signup'}
		<label>
			<span>Display name</span>
			<input bind:value={displayName} type="text" autocomplete="name" placeholder="Alex" />
		</label>
	{/if}

	<label>
		<span>Email</span>
		<input bind:value={email} type="email" required autocomplete="email" placeholder="you@family.com" />
	</label>

	<label>
		<span>Password</span>
		<input
			bind:value={password}
			type="password"
			required
			minlength="6"
			autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
			placeholder="••••••••"
		/>
	</label>

	{#if error}
		<p class="alert alert--error" role="alert">{error}</p>
	{/if}
	{#if message}
		<p class="alert alert--ok">{message}</p>
	{/if}

	<button type="submit" disabled={loading}>
		{loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Sign up'}
	</button>

	<button
		type="button"
		class="linkish"
		onclick={() => {
			mode = mode === 'login' ? 'signup' : 'login';
			error = '';
			message = '';
		}}
	>
		{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
	</button>
</form>

<style>
	.auth-card {
		width: min(100%, 26rem);
		display: grid;
		gap: 0.85rem;
		padding: 1.75rem;
		border-radius: 1.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		backdrop-filter: blur(12px);
		box-shadow: var(--shadow);
	}

	.auth-card__brand h1 {
		font-family: var(--font-display);
		font-size: 1.85rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text);
		margin: 0.2rem 0 0.35rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}

	.lede {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.95rem;
		line-height: 1.45;
	}

	label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	input {
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		color: var(--text);
		padding: 0.7rem 0.85rem;
		font: inherit;
	}

	input:focus {
		outline: 2px solid rgba(13, 148, 136, 0.35);
		outline-offset: 1px;
	}

	button[type='submit'] {
		margin-top: 0.35rem;
		border: none;
		border-radius: 0.85rem;
		padding: 0.8rem 1rem;
		font-family: var(--font-display);
		font-weight: 700;
		background: linear-gradient(135deg, #14b8a6, #0d9488 55%, #f59e0b);
		color: #042f2e;
		cursor: pointer;
	}

	button[type='submit']:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.linkish {
		border: none;
		background: transparent;
		color: var(--accent);
		cursor: pointer;
		font-size: 0.85rem;
		text-align: center;
		padding: 0.35rem;
	}

	.alert {
		margin: 0;
		font-size: 0.85rem;
		padding: 0.55rem 0.7rem;
		border-radius: 0.65rem;
	}

	.alert--error {
		background: var(--danger-bg);
		color: var(--danger-text);
	}

	.alert--ok {
		background: var(--ok-bg);
		color: var(--ok-text);
	}
</style>
