<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { fade, fly } from 'svelte/transition';
	import type { GrandReward } from '$lib/types';
	import RewardVaultScene from './RewardVaultScene.svelte';

	interface Props {
		reward: GrandReward;
		onclose: () => void;
	}

	let { reward, onclose }: Props = $props();

	let reveal = $state(false);
	let dialogEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const revealTimer = window.setTimeout(() => {
			reveal = true;
		}, 1100);

		const focusTimer = window.setTimeout(() => {
			dialogEl?.focus();
		}, 50);

		function onKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') onclose();
		}
		window.addEventListener('keydown', onKeydown);

		return () => {
			document.body.style.overflow = previousOverflow;
			window.clearTimeout(revealTimer);
			window.clearTimeout(focusTimer);
			window.removeEventListener('keydown', onKeydown);
		};
	});
</script>

<div
	class="overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby="reward-open-title"
	tabindex="-1"
	bind:this={dialogEl}
	transition:fade={{ duration: 280 }}
>
	<button type="button" class="overlay__backdrop" aria-label="Dismiss reward celebration" onclick={onclose}
	></button>

	<div class="overlay__stage" aria-hidden="true">
		<div class="overlay__glow"></div>
		<div class="overlay__canvas">
			<Canvas>
				<RewardVaultScene progress={1} opening controlsEnabled={false} />
			</Canvas>
		</div>
	</div>

	{#if reveal}
		<div class="overlay__copy" transition:fly={{ y: 28, duration: 420 }}>
			<p class="overlay__eyebrow">Reward unlocked</p>
			<h2 id="reward-open-title">{reward.title}</h2>
			{#if reward.description}
				<p class="overlay__desc">{reward.description}</p>
			{/if}
			<p class="overlay__cost">{Number(reward.points_required).toFixed(1)} points claimed</p>
			<button type="button" class="overlay__btn" onclick={onclose}>Continue</button>
		</div>
	{/if}
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 1.25rem;
		outline: none;
	}

	.overlay__backdrop {
		position: absolute;
		inset: 0;
		border: none;
		cursor: pointer;
		background:
			radial-gradient(ellipse at 50% 35%, rgba(251, 191, 36, 0.22), transparent 55%),
			radial-gradient(ellipse at 50% 80%, rgba(13, 148, 136, 0.28), transparent 50%),
			rgba(8, 28, 26, 0.72);
		backdrop-filter: blur(10px);
	}

	.overlay__stage {
		position: relative;
		z-index: 1;
		width: min(36rem, 100%);
		height: min(52vh, 26rem);
		pointer-events: none;
	}

	.overlay__glow {
		position: absolute;
		inset: 18% 22%;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(253, 230, 138, 0.55), transparent 70%);
		filter: blur(18px);
		animation: pulse-glow 1.8s ease-in-out infinite;
	}

	.overlay__canvas {
		position: relative;
		width: 100%;
		height: 100%;
		animation: stage-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.overlay__copy {
		position: relative;
		z-index: 2;
		margin-top: -1.5rem;
		display: grid;
		justify-items: center;
		gap: 0.45rem;
		text-align: center;
		max-width: 26rem;
		padding: 0 0.5rem;
	}

	.overlay__eyebrow {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #fbbf24;
	}

	.overlay__copy h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 4vw, 2.4rem);
		letter-spacing: -0.03em;
		color: #f8faf8;
		text-wrap: balance;
	}

	.overlay__desc,
	.overlay__cost {
		margin: 0;
		color: rgba(236, 253, 245, 0.82);
		font-family: var(--font-body);
		font-size: 0.98rem;
		line-height: 1.45;
	}

	.overlay__cost {
		font-size: 0.85rem;
		color: rgba(253, 230, 138, 0.9);
	}

	.overlay__btn {
		margin-top: 0.65rem;
		border: none;
		border-radius: 0.85rem;
		padding: 0.75rem 1.35rem;
		font-family: var(--font-display);
		font-weight: 700;
		cursor: pointer;
		background: linear-gradient(135deg, #f59e0b, #fbbf24);
		color: #451a03;
		box-shadow: 0 10px 28px rgba(245, 158, 11, 0.35);
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease;
	}

	.overlay__btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 14px 32px rgba(245, 158, 11, 0.45);
	}

	.overlay__btn:focus-visible {
		outline: 2px solid #fde68a;
		outline-offset: 3px;
	}

	@keyframes stage-rise {
		from {
			opacity: 0;
			transform: translateY(18px) scale(0.94);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.55;
			transform: scale(0.96);
		}
		50% {
			opacity: 1;
			transform: scale(1.05);
		}
	}

	@media (max-width: 640px) {
		.overlay {
			align-content: center;
			gap: 0.25rem;
		}

		.overlay__stage {
			height: min(44vh, 20rem);
		}

		.overlay__copy {
			margin-top: -0.5rem;
		}
	}
</style>
