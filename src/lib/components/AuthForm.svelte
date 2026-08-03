<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import logoWordmark from '$lib/assets/logo-wordmark.svg';
	import { supabase } from '$lib/supabase';
	import type { ExperienceMode } from '$lib/types';

	interface Props {
		onAuthenticated?: () => void;
	}

	let { onAuthenticated }: Props = $props();

	let mode = $state<'login' | 'signup'>('login');
	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let experienceMode = $state<ExperienceMode>('kids');
	let loading = $state(false);
	let oauthLoading = $state(false);
	let message = $state('');
	let error = $state('');

	$effect(() => {
		const oauthError =
			page.url.searchParams.get('error_description') || page.url.searchParams.get('error');
		if (oauthError) error = oauthError;
	});

	function oauthRedirectTo() {
		const next = page.url.searchParams.get('next');
		const callback = new URL(resolve('/auth/callback/'), window.location.origin);
		if (next) callback.searchParams.set('next', next);
		return callback.toString();
	}

	async function signInWithGoogle() {
		oauthLoading = true;
		error = '';
		message = '';
		try {
			if (mode === 'signup') {
				localStorage.setItem('hh_experience_mode', experienceMode);
			} else {
				localStorage.removeItem('hh_experience_mode');
			}
			const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: oauthRedirectTo(),
					queryParams: {
						access_type: 'offline',
						prompt: 'select_account'
					}
				}
			});
			if (oauthError) throw oauthError;
			if (data.url) {
				window.location.assign(data.url);
				return;
			}
			throw new Error('Google sign-in did not return a redirect URL.');
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			oauthLoading = false;
		}
	}

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
					options: {
						data: {
							display_name: displayName || email.split('@')[0],
							experience_mode: experienceMode
						}
					}
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
		<img class="wordmark" src={logoWordmark} alt="HeroHabbits" width="280" height="186" />
		<h1>{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
		<p class="lede">Complete quests, earn XP, and claim bounties with your guild.</p>
	</div>

	<button
		type="button"
		class="google"
		disabled={loading || oauthLoading}
		onclick={signInWithGoogle}
	>
		<svg class="google__icon" viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#EA4335"
				d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12Z"
			/>
			<path fill="#34A853" d="M3.6 7.4 6.6 9.6C7.4 7.6 9.5 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 8.2 2.7 4.9 4.9 3.6 7.4Z" />
			<path fill="#4A90E2" d="M12 21.3c2.4 0 4.5-.8 6-2.1l-2.9-2.2c-.8.6-1.9 1-3.1 1-3.1 0-5.6-2.1-6.5-4.9l-3 2.3C4.1 18.9 7.7 21.3 12 21.3Z" />
			<path fill="#FBBC05" d="M5.5 13.9c-.2-.6-.4-1.2-.4-1.9s.1-1.3.3-1.9L2.4 7.8C1.7 9.1 1.3 10.5 1.3 12s.4 2.9 1.1 4.2l3.1-2.3Z" />
		</svg>
		{oauthLoading ? 'Redirecting to Google…' : 'Continue with Google'}
	</button>

	<div class="divider" aria-hidden="true"><span>or</span></div>

	{#if mode === 'signup'}
		<label>
			<span>Display name</span>
			<input bind:value={displayName} type="text" autocomplete="name" placeholder="Alex" />
		</label>

		<fieldset class="mode-pick">
			<legend>I want to use HeroHabbits for</legend>
			<label class="mode-option">
				<input type="radio" name="experience" value="kids" bind:group={experienceMode} />
				<span>
					<strong>Family adventures</strong>
					<em>Playful tracking for family milestones</em>
				</span>
			</label>
			<label class="mode-option">
				<input type="radio" name="experience" value="goals" bind:group={experienceMode} />
				<span>
					<strong>Personal quests</strong>
					<em>Elegant quests and personal bounties</em>
				</span>
			</label>
		</fieldset>
		<p class="legal-note">
			Accounts are for parents/guardians (13+). Kids are added as questors, not as login users.
			By signing up you agree to our
			<a href={resolve('/terms/')}>Terms</a> and
			<a href={resolve('/privacy/')}>Privacy Policy</a>.
		</p>
	{/if}

	<label>
		<span>Email</span>
		<input bind:value={email} type="email" required autocomplete="email" placeholder="you@email.com" />
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

	<button type="submit" disabled={loading || oauthLoading}>
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
		padding: 1.25rem;
		border-radius: 1.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		backdrop-filter: blur(12px);
		box-shadow: var(--shadow);
	}

	@media (min-width: 640px) {
		.auth-card {
			padding: 1.75rem;
		}
	}

	.auth-card__brand {
		text-align: center;
	}

	.auth-card__brand .wordmark {
		display: block;
		width: min(100%, 16rem);
		height: auto;
		margin: 0 auto 0.35rem;
	}

	.auth-card__brand h1 {
		font-family: var(--font-display);
		font-size: 1.85rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text);
		margin: 0.35rem 0 0.35rem;
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
		padding: 0.75rem 0.85rem;
		min-height: 44px;
		font: inherit;
		width: 100%;
		box-sizing: border-box;
	}

	input:focus {
		outline: 2px solid rgba(99, 102, 241, 0.4);
		outline-offset: 1px;
	}

	button[type='submit'] {
		margin-top: 0.35rem;
		border: none;
		border-radius: 0.85rem;
		padding: 0.85rem 1rem;
		min-height: 44px;
		font-family: var(--font-display);
		font-weight: 700;
		background: linear-gradient(135deg, var(--accent), var(--accent-bright) 55%, var(--amber));
		color: var(--accent-ink);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	button[type='submit']:hover:not(:disabled) {
		transform: scale(1.02);
	}

	button[type='submit']:active:not(:disabled) {
		transform: scale(0.95);
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
		padding: 0.65rem;
		min-height: 44px;
	}

	.google {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		width: 100%;
		min-height: 44px;
		border-radius: 0.85rem;
		border: 1px solid var(--border-strong);
		background: var(--surface-strong);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.google:hover:not(:disabled) {
		transform: scale(1.02);
	}

	.google:disabled {
		opacity: 0.65;
		cursor: wait;
	}

	.google__icon {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
	}

	.divider {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.65rem;
		color: var(--text-soft);
		font-size: 0.8rem;
	}

	.divider::before,
	.divider::after {
		content: '';
		height: 1px;
		background: var(--border);
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

	.mode-pick {
		margin: 0;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.85rem;
		display: grid;
		gap: 0.55rem;
	}

	.mode-pick legend {
		padding: 0 0.25rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.mode-option {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.65rem;
		align-items: start;
		padding: 0.55rem 0.4rem;
		border-radius: 0.65rem;
		cursor: pointer;
	}

	.mode-option strong {
		display: block;
		color: var(--text);
		font-size: 0.92rem;
	}

	.mode-option em {
		display: block;
		font-style: normal;
		color: var(--text-soft);
		font-size: 0.8rem;
		margin-top: 0.15rem;
	}

	.legal-note {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-soft);
	}

	.legal-note a {
		color: var(--accent-bright);
	}
</style>
