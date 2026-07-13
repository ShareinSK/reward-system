<script lang="ts">
	import { page } from '$app/state';

	const message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<section class="error">
	<p class="eyebrow">Error</p>
	<h1>Something went wrong</h1>
	<p class="lede">{message}</p>
	<p class="hint">
		If this is a fresh GitHub Pages deploy, confirm repository secrets
		<code>PUBLIC_SUPABASE_URL</code> and <code>PUBLIC_SUPABASE_ANON_KEY</code> are set, then
		re-run the deploy workflow.
	</p>
</section>

<style>
	.error {
		max-width: 36rem;
		margin: 3rem auto;
		padding: 1.5rem;
		border-radius: 1.15rem;
		background: var(--surface, #fff);
		border: 1px solid var(--border, #ccc);
		box-shadow: var(--shadow, none);
	}
	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent, #0f766e);
		font-family: var(--font-display, system-ui);
	}
	h1 {
		margin: 0.35rem 0;
		font-family: var(--font-display, system-ui);
		color: var(--text, #12352f);
	}
	.lede,
	.hint {
		color: var(--text-muted, #4d6f68);
		line-height: 1.45;
	}
	code {
		font-size: 0.9em;
	}
</style>
