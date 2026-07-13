<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import { supabase } from '$lib/supabase';

	const nextPath = $derived(page.url.searchParams.get('next') || resolve('/dashboard'));

	$effect(() => {
		let cancelled = false;
		supabase.auth.getSession().then(({ data }) => {
			if (!cancelled && data.session) goto(nextPath, { replaceState: true });
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="login">
	<AuthForm onAuthenticated={() => goto(nextPath, { replaceState: true })} />
</section>

<style>
	.login {
		min-height: 70dvh;
		display: grid;
		place-items: center;
		padding: 2rem 0;
	}
</style>
