<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		completeOnboarding,
		findTourTarget,
		getTourSteps,
		type TourStep
	} from '$lib/onboarding';
	import type { ExperienceMode } from '$lib/types';

	let {
		open = false,
		experienceMode = 'kids' as ExperienceMode,
		onClose
	}: {
		open?: boolean;
		experienceMode?: ExperienceMode;
		onClose?: () => void;
	} = $props();

	let stepIndex = $state(0);
	let hole = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let cardStyle = $state<string>('');
	let busy = $state(false);

	const steps = $derived(getTourSteps(experienceMode));
	const step = $derived(steps[stepIndex] as TourStep | undefined);
	const isLast = $derived(stepIndex >= steps.length - 1);
	const progress = $derived(`${Math.min(stepIndex + 1, steps.length)} / ${steps.length}`);

	function measure() {
		const targetId = step?.target;
		if (!targetId) {
			hole = null;
			cardStyle = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
			return;
		}

		const el = findTourTarget(targetId);
		if (!el) {
			hole = null;
			cardStyle = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
			return;
		}

		const rect = el.getBoundingClientRect();
		const pad = 8;
		hole = {
			top: Math.max(8, rect.top - pad),
			left: Math.max(8, rect.left - pad),
			width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
			height: Math.min(window.innerHeight - 16, rect.height + pad * 2)
		};

		const cardWidth = Math.min(360, window.innerWidth - 24);
		const spaceBelow = window.innerHeight - (hole.top + hole.height);
		const placeBelow = spaceBelow > 220 || hole.top < 180;
		const left = Math.min(
			Math.max(12, hole.left + hole.width / 2 - cardWidth / 2),
			window.innerWidth - cardWidth - 12
		);

		if (placeBelow) {
			const top = Math.min(hole.top + hole.height + 14, window.innerHeight - 210);
			cardStyle = `top: ${top}px; left: ${left}px; width: ${cardWidth}px; transform: none;`;
		} else {
			const top = Math.max(12, hole.top - 200);
			cardStyle = `top: ${top}px; left: ${left}px; width: ${cardWidth}px; transform: none;`;
		}
	}

	async function prepareStep(index: number) {
		busy = true;
		const next = steps[index];
		if (next?.route) {
			const pathByRoute: Record<string, string> = {
				'/dashboard': resolve('/dashboard/'),
				'/participants': resolve('/participants/'),
				'/activities': resolve('/activities/'),
				'/rewards': resolve('/rewards/'),
				'/share': resolve('/share/'),
				'/settings': resolve('/settings/')
			};
			const href = pathByRoute[next.route] ?? resolve('/dashboard/');
			await goto(href, { replaceState: false, noScroll: true });
			// Wait for route + chrome to paint
			await new Promise((r) => setTimeout(r, 120));
			await new Promise((r) => requestAnimationFrame(() => r(undefined)));
		}
		stepIndex = index;
		await new Promise((r) => setTimeout(r, 40));
		measure();
		// Retry once if target not ready (FAB / nav mount)
		if (next?.target && !findTourTarget(next.target)) {
			await new Promise((r) => setTimeout(r, 180));
			measure();
		}
		busy = false;
	}

	$effect(() => {
		if (!open) return;
		void prepareStep(0);

		const onResize = () => measure();
		window.addEventListener('resize', onResize);
		window.addEventListener('scroll', onResize, true);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('scroll', onResize, true);
		};
	});

	async function finish() {
		await completeOnboarding();
		onClose?.();
	}

	async function next() {
		if (busy) return;
		if (isLast) {
			await finish();
			return;
		}
		await prepareStep(stepIndex + 1);
	}

	async function back() {
		if (busy || stepIndex === 0) return;
		await prepareStep(stepIndex - 1);
	}

	async function skip() {
		await finish();
	}
</script>

{#if open && step}
	<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
		<div class="tour__scrim" class:tour__scrim--full={!hole}></div>
		{#if hole}
			<div
				class="tour__hole"
				style:top={`${hole.top}px`}
				style:left={`${hole.left}px`}
				style:width={`${hole.width}px`}
				style:height={`${hole.height}px`}
			></div>
		{/if}

		<div class="tour__card" style={cardStyle}>
			<p class="tour__progress">{progress}</p>
			<h2 id="tour-title">{step.title}</h2>
			<p class="tour__body">{step.body}</p>
			<div class="tour__actions">
				<button type="button" class="ghost" onclick={skip} disabled={busy}>Skip</button>
				<div class="tour__nav">
					{#if stepIndex > 0}
						<button type="button" class="ghost" onclick={back} disabled={busy}>Back</button>
					{/if}
					<button type="button" class="primary" onclick={next} disabled={busy}>
						{isLast ? 'Got it' : 'Next'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tour {
		position: fixed;
		inset: 0;
		z-index: 80;
		pointer-events: none;
	}

	.tour__scrim {
		position: absolute;
		inset: 0;
		background: transparent;
		pointer-events: none;
	}

	.tour__scrim--full {
		background: rgba(15, 23, 42, 0.55);
		pointer-events: auto;
	}

	.tour__hole {
		position: fixed;
		border-radius: 1rem;
		box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.55);
		outline: 2px solid color-mix(in srgb, var(--accent) 85%, white);
		outline-offset: 2px;
		pointer-events: none;
		transition:
			top 0.22s ease,
			left 0.22s ease,
			width 0.22s ease,
			height 0.22s ease;
		z-index: 81;
	}

	.tour__card {
		position: fixed;
		z-index: 82;
		pointer-events: auto;
		max-width: calc(100vw - 1.5rem);
		padding: 1.1rem 1.15rem 1rem;
		border-radius: 1.15rem;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		box-shadow: var(--shadow), 0 18px 40px rgba(15, 23, 42, 0.18);
		animation: tour-in 0.22s ease;
	}

	@keyframes tour-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.tour__progress {
		margin: 0 0 0.35rem;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.2rem;
		color: var(--text);
	}

	.tour__body {
		margin: 0.45rem 0 1rem;
		color: var(--text-muted);
		line-height: 1.45;
		font-size: 0.95rem;
	}

	.tour__actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.tour__nav {
		display: flex;
		gap: 0.5rem;
	}

	button {
		min-height: 44px;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		border: none;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.primary {
		background: var(--accent);
		color: var(--accent-ink);
	}

	.ghost {
		background: var(--surface-strong);
		color: var(--accent);
		border: 1px solid var(--border-strong);
	}
</style>
