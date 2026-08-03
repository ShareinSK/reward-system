<script lang="ts">
	import { page } from '$app/state';

	const message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<section class="error">
	<p class="eyebrow">Error</p>
	<h1>Well, that wasn’t supposed to happen</h1>
	<p class="lede">{message}</p>
	<p class="hint">
		Our points elves tripped over a cable. Give it another try — if it keeps happening, blame the
		wifi (or grab a snack and try again later).
	</p>
</section>

<style>
	.error {
		max-width: 36rem;
		margin: 2rem auto;
		padding: 1.25rem;
		border-radius: 1.15rem;
		background: var(--surface, #fff);
		border: 1px solid var(--border, #ccc);
		box-shadow: var(--shadow, none);
	}
	@media (min-width: 640px) {
		.error {
			margin: 3rem auto;
			padding: 1.5rem;
		}
	}
	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent, #6366f1);
		font-family: var(--font-display, system-ui);
	}
	h1 {
		margin: 0.35rem 0;
		font-family: var(--font-display, system-ui);
		color: var(--text, #1e1b4b);
	}
	.lede,
	.hint {
		color: var(--text-muted, #475569);
		line-height: 1.45;
	}
</style>
