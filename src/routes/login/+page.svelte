<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	// Alias for bookmarks / old links — hard replace avoids client-router loops.
	onMount(() => {
		const search = page.url.search || '';
		location.replace(`${resolve('/')}${search}`);
	});
</script>

<p class="boot">Redirecting…</p>

<style>
	.boot {
		margin: 4rem auto;
		text-align: center;
		color: var(--text-muted);
	}
</style>
