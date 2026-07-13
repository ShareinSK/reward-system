<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';

	onMount(async () => {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		goto(session ? `${base}/dashboard` : `${base}/login`);
	});
</script>

<p class="boot">Opening reward system…</p>

<style>
	.boot {
		margin: 4rem auto;
		text-align: center;
		color: var(--text-muted);
	}
</style>
