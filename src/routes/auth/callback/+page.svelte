<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ensureHouseholdId, fetchHousehold, updateExperienceMode } from '$lib/household';
	import { setActiveHouseholdId } from '$lib/householdStore';
	import { supabase } from '$lib/supabase';
	import type { ExperienceMode } from '$lib/types';

	let status = $state('Finishing Google sign-in…');
	let error = $state('');

	const nextPath = $derived(page.url.searchParams.get('next') || resolve('/dashboard/'));

	$effect(() => {
		let cancelled = false;

		async function finish() {
			try {
				const code = page.url.searchParams.get('code');
				const oauthError = page.url.searchParams.get('error_description') || page.url.searchParams.get('error');

				if (oauthError) {
					throw new Error(oauthError);
				}

				if (code) {
					const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
					if (exchangeError) throw exchangeError;
				} else {
					// Implicit / already-handled session
					const { data } = await supabase.auth.getSession();
					if (!data.session) {
						throw new Error('No auth code returned from Google. Try signing in again.');
					}
				}

				if (cancelled) return;

				const preferred = localStorage.getItem('hh_experience_mode') as ExperienceMode | null;
				localStorage.removeItem('hh_experience_mode');

				const hid = await ensureHouseholdId();
				setActiveHouseholdId(hid);

				if (preferred === 'kids' || preferred === 'goals') {
					const household = await fetchHousehold(hid);
					if (household.experience_mode !== preferred) {
						await updateExperienceMode(hid, preferred);
					}
				}

				status = 'Signed in — redirecting…';
				goto(nextPath, { replaceState: true });
			} catch (err) {
				if (cancelled) return;
				error = err instanceof Error ? err.message : String(err);
				status = 'Could not complete Google sign-in';
			}
		}

		finish();
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="page">
	<p class="eyebrow">Hero Habits</p>
	<h1>{status}</h1>
	{#if error}
		<p class="alert">{error}</p>
		<a href={resolve('/')}>Back to login</a>
	{/if}
</section>

<style>
	.page {
		min-height: 60dvh;
		display: grid;
		place-content: center;
		gap: 0.75rem;
		text-align: center;
		padding: 2rem 1rem;
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
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
	}
	.alert {
		margin: 0;
		padding: 0.65rem 0.85rem;
		border-radius: 0.75rem;
		background: var(--danger-bg);
		color: var(--danger-text);
	}
	a {
		color: var(--accent-bright);
	}
</style>
