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
			radial-gradient(ellipse at 30% 20%, rgba(45, 212, 191, 0.28), transparent 55%),
			radial-gradient(ellipse at 80% 80%, rgba(251, 191, 36, 0.16), transparent 50%),
			linear-gradient(165deg, #b7d9d1 0%, #9ec9bf 45%, #88b8ad 100%);
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
		color: rgba(15, 53, 47, 0.65);
	}

	.vault-caption__value {
		font-family: var(--font-body);
		font-size: 0.95rem;
		font-weight: 600;
		color: #12352f;
	}
</style>
