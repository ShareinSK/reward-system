<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import { Spring } from 'svelte/motion';
	import type { PerspectiveCamera } from 'three';

	interface Props {
		progress: number;
		balance?: number;
		targetPoints?: number;
		/** When true, animate the chest lid fully open for a claim celebration */
		opening?: boolean;
		/** Disable orbit drag (used in fullscreen overlay) */
		controlsEnabled?: boolean;
	}

	let {
		progress = 0,
		opening = false,
		controlsEnabled = true
	}: Props = $props();

	interactivity();
	const { camera } = useThrelte();

	const scaleSpring = new Spring(1);
	const glowSpring = new Spring(0.25);
	const openSpring = new Spring(0, { stiffness: 0.06, damping: 0.35 });

	$effect(() => {
		if (opening) {
			// Start closed, then spring the lid wide open
			openSpring.set(0, { instant: true });
			queueMicrotask(() => {
				openSpring.target = 1;
			});
			scaleSpring.target = 1.2;
			glowSpring.target = 1.35;
		} else {
			openSpring.target = 0;
			scaleSpring.target = 0.85 + progress * 0.45;
			glowSpring.target = 0.2 + progress * 0.8;
		}
	});

	let rotation = $state(0);
	let hoverBoost = $state(0);

	useTask((delta) => {
		if (opening) {
			// Slow ceremonial spin while opening
			rotation += delta * (0.12 + openSpring.current * 0.2);
			return;
		}
		rotation += delta * (0.25 + progress * 0.55 + hoverBoost);
	});

	const openAmount = $derived(opening ? openSpring.current : 0);
	const emissiveIntensity = $derived(glowSpring.current);
	const vaultScale = $derived(scaleSpring.current);
	const lidLift = $derived(opening ? openAmount * 0.95 : progress * 0.35);
	const lidTilt = $derived(opening ? openAmount * 1.55 : lidLift * 0.8);
	const gemScale = $derived(
		opening ? 0.35 + openAmount * 0.85 : 0.3 + progress * 0.55
	);
	const gemLift = $derived(opening ? openAmount * 0.85 : 0);
	const innerGlow = $derived(
		opening ? Math.max(0, openAmount - 0.25) * 1.1 : Math.max(0, progress - 0.65) * 1.4
	);

	function setDefaultCamera(ref: PerspectiveCamera) {
		camera.set(ref);
		ref.lookAt(0, 0.6, 0);
	}
</script>

<T.PerspectiveCamera
	position={opening ? [3.6, 2.8, 4.2] : [4.2, 3.2, 4.8]}
	fov={42}
	oncreate={setDefaultCamera}
>
	{#if controlsEnabled}
		<OrbitControls
			enableDamping
			enablePan={false}
			maxPolarAngle={Math.PI / 2.05}
			minDistance={3}
			maxDistance={9}
		/>
	{/if}
</T.PerspectiveCamera>

<T.AmbientLight intensity={opening ? 0.55 : 0.45} />
<T.DirectionalLight position={[5, 8, 3]} intensity={1.35} castShadow />
<T.PointLight
	position={[0, 2.5, 0]}
	intensity={emissiveIntensity * (opening ? 3.2 : 2.2)}
	color="#fbbf24"
	distance={8}
/>
{#if opening && openAmount > 0.4}
	<T.PointLight
		position={[0, 1.4 + gemLift, 0.2]}
		intensity={openAmount * 4}
		color="#fde68a"
		distance={5}
	/>
{/if}

<!-- Ground disc -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={-0.02} receiveShadow>
	<T.CircleGeometry args={[2.2, 48]} />
	<T.MeshStandardMaterial color="#c5ddd6" roughness={0.9} metalness={0.05} />
</T.Mesh>

<!-- Vault body group -->
<T.Group
	rotation.y={rotation}
	scale={vaultScale}
	onpointerenter={() => {
		if (opening) return;
		hoverBoost = 0.4;
		scaleSpring.target = 0.95 + progress * 0.5;
	}}
	onpointerleave={() => {
		if (opening) return;
		hoverBoost = 0;
		scaleSpring.target = 0.85 + progress * 0.45;
	}}
>
	<!-- Chest body -->
	<T.Mesh position.y={0.45} castShadow>
		<T.BoxGeometry args={[1.6, 0.9, 1.1]} />
		<T.MeshStandardMaterial
			color="#134e4a"
			metalness={0.55}
			roughness={0.35}
			emissive="#0f766e"
			emissiveIntensity={emissiveIntensity * 0.35}
		/>
	</T.Mesh>

	<!-- Metal bands -->
	<T.Mesh position.y={0.45} castShadow>
		<T.BoxGeometry args={[1.68, 0.12, 1.18]} />
		<T.MeshStandardMaterial color="#f59e0b" metalness={0.85} roughness={0.25} />
	</T.Mesh>

	<!-- Lid -->
	<T.Mesh position={[0, 0.95 + lidLift, -0.15]} rotation.x={-lidTilt} castShadow>
		<T.BoxGeometry args={[1.6, 0.28, 1.1]} />
		<T.MeshStandardMaterial
			color="#115e59"
			metalness={0.5}
			roughness={0.4}
			emissive="#14b8a6"
			emissiveIntensity={emissiveIntensity * 0.25}
		/>
	</T.Mesh>

	<!-- Lock gem / crystal that brightens with progress (and rises when opening) -->
	<T.Mesh position={[0, 0.55 + gemLift, 0.58]} scale={gemScale} castShadow>
		<T.OctahedronGeometry args={[0.22, 0]} />
		<T.MeshStandardMaterial
			color="#fbbf24"
			emissive="#f59e0b"
			emissiveIntensity={emissiveIntensity}
			metalness={0.3}
			roughness={0.15}
			transparent
			opacity={opening ? 0.7 + openAmount * 0.3 : 0.55 + progress * 0.45}
		/>
	</T.Mesh>

	<!-- Inner glow plane when nearly unlocked or opening -->
	{#if innerGlow > 0}
		<T.Mesh position.y={0.7} rotation.x={-Math.PI / 2}>
			<T.PlaneGeometry args={[1.2, 0.8]} />
			<T.MeshBasicMaterial color="#fde68a" transparent opacity={Math.min(1, innerGlow)} />
		</T.Mesh>
	{/if}
</T.Group>
