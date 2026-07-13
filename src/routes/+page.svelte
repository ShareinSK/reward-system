<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';

	onMount(async () => {
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			await goto(resolve(session ? '/dashboard' : '/login'), { replaceState: true });
		} catch {
			await goto(resolve('/login'), { replaceState: true });
		}
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
