<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import { supabase } from '$lib/supabase';

	const nextPath = $derived(page.url.searchParams.get('next') || `${base}/dashboard`);

	$effect(() => {
		let cancelled = false;
		supabase.auth.getSession().then(({ data }) => {
			if (!cancelled && data.session) goto(nextPath);
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="login">
	<AuthForm onAuthenticated={() => goto(nextPath)} />
</section>

<style>
	.login {
		min-height: 70dvh;
		display: grid;
		place-items: center;
		padding: 2rem 0;
	}
</style>
