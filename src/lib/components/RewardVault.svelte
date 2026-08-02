<script lang="ts">
	import { Canvas } from '@threlte/core';
	import RewardVaultScene from './RewardVaultScene.svelte';

	interface Props {
		/** Cumulative point balance for the active participant */
		balance?: number;
		/** Points required for the next (or nearest) grand reward */
		targetPoints?: number;
		class?: string;
	}

	let { balance = 0, targetPoints = 100, class: className = '' }: Props = $props();

	const progress = $derived(
		targetPoints > 0 ? Math.min(1, Math.max(0, balance / targetPoints)) : 0
	);
</script>

<div class="vault-frame {className}">
	<Canvas>
		<RewardVaultScene {progress} {balance} {targetPoints} />
	</Canvas>
	<div class="vault-caption">
		<span class="vault-caption__label">Reward Vault</span>
		<span class="vault-caption__value">{Math.round(progress * 100)}% to next reward</span>
	</div>
</div>

<style>
	.vault-frame {
		position: relative;
		overflow: hidden;
		border-radius: 1.25rem;
		background:
			radial-gradient(ellipse at 30% 20%, rgba(99, 102, 241, 0.28), transparent 55%),
			radial-gradient(ellipse at 80% 80%, rgba(251, 191, 36, 0.2), transparent 50%),
			linear-gradient(165deg, #c7d2fe 0%, #a5b4fc 45%, #818cf8 100%);
		min-height: 280px;
		height: 100%;
	}

	.vault-caption {
		pointer-events: none;
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.vault-caption__label {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(30, 27, 75, 0.7);
	}

	.vault-caption__value {
		font-family: var(--font-body);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}
</style>
