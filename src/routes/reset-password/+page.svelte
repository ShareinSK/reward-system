<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import logoMark from '$lib/assets/logo-mark.svg';
	import { supabase } from '$lib/supabase';

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let bootstrapping = $state(true);
	let ready = $state(false);
	let error = $state('');
	let message = $state('');

	$effect(() => {
		let cancelled = false;
		let recoveryOk = false;

		function markReady() {
			if (cancelled) return;
			recoveryOk = true;
			ready = true;
			bootstrapping = false;
			error = '';
		}

		async function bootstrap() {
			try {
				const linkError =
					page.url.searchParams.get('error_description') || page.url.searchParams.get('error');
				if (linkError) {
					throw new Error(linkError);
				}

				const code = page.url.searchParams.get('code');
				if (code) {
					const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
					if (exchangeError) throw exchangeError;
					// Drop the one-time code from the URL after exchange.
					const clean = new URL(window.location.href);
					clean.searchParams.delete('code');
					window.history.replaceState({}, '', clean.pathname + clean.search);
					markReady();
					return;
				}

				// Implicit-flow recovery links land with hash tokens; wait briefly for PASSWORD_RECOVERY.
				await new Promise((r) => setTimeout(r, 800));
				if (cancelled || recoveryOk) return;

				throw new Error('This reset link is invalid or has expired. Request a new one.');
			} catch (err) {
				if (cancelled || recoveryOk) return;
				error = err instanceof Error ? err.message : String(err);
				ready = false;
				bootstrapping = false;
			}
		}

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event) => {
			if (event === 'PASSWORD_RECOVERY') {
				markReady();
			}
		});

		bootstrap();

		return () => {
			cancelled = true;
			subscription.unsubscribe();
		};
	});

	async function submit(e: Event) {
		e.preventDefault();
		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}
		if (password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		loading = true;
		error = '';
		message = '';

		try {
			const { error: updateError } = await supabase.auth.updateUser({ password });
			if (updateError) throw updateError;
			message = 'Password updated. Redirecting…';
			goto(resolve('/dashboard/'), { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}
</script>

<section class="page">
	{#if bootstrapping}
		<form class="auth-card" aria-busy="true">
			<div class="auth-card__brand">
				<div class="brand-lockup" aria-hidden="true">
					<img class="brand-lockup__logo" src={logoMark} alt="" width="192" height="192" />
				</div>
				<h1>Reset password</h1>
				<p class="lede">Checking your reset link…</p>
			</div>
		</form>
	{:else if !ready}
		<form class="auth-card">
			<div class="auth-card__brand">
				<div class="brand-lockup" aria-hidden="true">
					<img class="brand-lockup__logo" src={logoMark} alt="" width="192" height="192" />
				</div>
				<h1>Link expired</h1>
				<p class="lede">Request a new password reset from the sign-in page.</p>
			</div>
			{#if error}
				<p class="alert alert--error" role="alert">{error}</p>
			{/if}
			<a class="submit-link" href={resolve('/')}>Back to sign in</a>
		</form>
	{:else}
		<form class="auth-card" onsubmit={submit}>
			<div class="auth-card__brand">
				<div class="brand-lockup" aria-hidden="true">
					<img class="brand-lockup__logo" src={logoMark} alt="" width="192" height="192" />
				</div>
				<h1>Choose a new password</h1>
				<p class="lede">Pick something memorable that only you know.</p>
			</div>

			<label>
				<span>New password</span>
				<input
					bind:value={password}
					type="password"
					required
					minlength="6"
					autocomplete="new-password"
					placeholder="••••••••"
				/>
			</label>

			<label>
				<span>Confirm password</span>
				<input
					bind:value={confirmPassword}
					type="password"
					required
					minlength="6"
					autocomplete="new-password"
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
				{loading ? 'Updating…' : 'Update password'}
			</button>
		</form>
	{/if}
</section>

<style>
	.page {
		min-height: 70dvh;
		display: grid;
		place-items: center;
		padding: 1rem 0 2rem;
	}

	@media (min-width: 640px) {
		.page {
			padding: 2rem 0;
		}
	}

	.auth-card {
		width: min(100%, 26rem);
		display: grid;
		gap: 0.85rem;
		padding: 0.85rem 1.25rem 1.25rem;
		border-radius: 1.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		backdrop-filter: blur(12px);
		box-shadow: var(--shadow);
	}

	@media (min-width: 640px) {
		.auth-card {
			padding: 1rem 1.75rem 1.75rem;
		}
	}

	.auth-card__brand {
		text-align: center;
	}

	.brand-lockup {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 0.15rem;
		line-height: 0;
	}

	.brand-lockup__logo {
		display: block;
		width: 10.5rem;
		height: 10.5rem;
		object-fit: contain;
	}

	@media (min-width: 640px) {
		.brand-lockup__logo {
			width: 12rem;
			height: 12rem;
		}
	}

	.auth-card__brand h1 {
		font-family: var(--font-display);
		font-size: 1.85rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text);
		margin: 0.1rem 0 0.35rem;
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

	button[type='submit'],
	.submit-link {
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
		text-align: center;
		text-decoration: none;
		display: grid;
		place-items: center;
	}

	button[type='submit']:hover:not(:disabled),
	.submit-link:hover {
		transform: scale(1.02);
	}

	button[type='submit']:active:not(:disabled) {
		transform: scale(0.95);
	}

	button[type='submit']:disabled {
		opacity: 0.6;
		cursor: wait;
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
