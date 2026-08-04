<script lang="ts">
	import logoNav from '$lib/assets/logo-with-text.svg';
	import logoMark from '$lib/assets/logo-mark.svg';

	type OptionId = 'app' | 'white' | 'soft' | 'dark' | 'navy_pill' | 'indigo_pill';

	const options: {
		id: OptionId;
		title: string;
		blurb: string;
		bar: string;
		page: string;
		pill?: boolean;
	}[] = [
		{
			id: 'app',
			title: 'App gradient (selected)',
			blurb: 'Transparent logo directly on the kids-theme page background — chosen for QuestorLog chrome.',
			bar: 'color-mix(in srgb, #eef2ff 92%, white)',
			page: 'radial-gradient(ellipse at 12% -8%, rgba(99,102,241,0.18), transparent 42%), linear-gradient(180deg, #eef2ff 0%, #f8fafc 55%, #fff7ed 100%)'
		},
		{
			id: 'white',
			title: 'Clean white bar',
			blurb: 'Simple white/light surface — checks if grey wordmark stays readable.',
			bar: '#ffffff',
			page: '#f1f5f9'
		},
		{
			id: 'soft',
			title: 'Soft parchment',
			blurb: 'Warm light panel similar to goals theme.',
			bar: '#f7f3ea',
			page: 'linear-gradient(180deg, #f7f3ea, #efe8da)'
		},
		{
			id: 'dark',
			title: 'Dark bar',
			blurb: 'Near-black chrome — matches a baked black artboard if present.',
			bar: '#0b1220',
			page: '#111827'
		},
		{
			id: 'navy_pill',
			title: 'Navy pill badge',
			blurb: 'Logo sits on a rounded dark badge over the light app background.',
			bar: 'color-mix(in srgb, #eef2ff 92%, white)',
			page: 'radial-gradient(ellipse at 12% -8%, rgba(99,102,241,0.18), transparent 42%), linear-gradient(180deg, #eef2ff 0%, #f8fafc 55%, #fff7ed 100%)',
			pill: true
		},
		{
			id: 'indigo_pill',
			title: 'Indigo pill badge',
			blurb: 'Accent-colored badge for a stronger brand chip in the nav.',
			bar: 'color-mix(in srgb, #eef2ff 92%, white)',
			page: 'radial-gradient(ellipse at 12% -8%, rgba(99,102,241,0.18), transparent 42%), linear-gradient(180deg, #eef2ff 0%, #f8fafc 55%, #fff7ed 100%)',
			pill: true
		}
	];

	let selected = $state<OptionId>('app');
	const active = $derived(options.find((o) => o.id === selected) ?? options[0]);
</script>

<svelte:head>
	<title>QuestorLog — brand preview</title>
</svelte:head>

<section class="preview">
	<header class="hero">
		<p class="eyebrow">Temporary preview</p>
		<h1>QuestorLog logo treatments</h1>
		<p class="lede">
			Compare backgrounds before we finalize the rebrand. Pick a look below — this page is only for
			review and can be removed after you choose.
		</p>
	</header>

	<div class="chooser" role="listbox" aria-label="Background options">
		{#each options as opt}
			<button
				type="button"
				class:active={selected === opt.id}
				onclick={() => (selected = opt.id)}
			>
				<strong>{opt.title}</strong>
				<span>{opt.blurb}</span>
			</button>
		{/each}
	</div>

	<article class="stage" style={`background: ${active.page}`}>
		<p class="stage__label">Selected: {active.title}</p>

		<div class="mock-nav" style={`background: ${active.bar}`}>
			{#if active.pill}
				<div
					class="pill"
					class:pill--navy={selected === 'navy_pill'}
					class:pill--indigo={selected === 'indigo_pill'}
				>
					<img class="nav-logo" src={logoNav} alt="QuestorLog" width="320" height="152" />
				</div>
			{:else}
				<img class="nav-logo" src={logoNav} alt="QuestorLog" width="320" height="152" />
			{/if}
			<div class="mock-links" aria-hidden="true">
				<span>Quest Log</span>
				<span>Questors</span>
				<span>Quests</span>
			</div>
		</div>

		<div class="cards">
			<figure>
				<figcaption>Nav lockup (logo-with-text)</figcaption>
				<div
					class="swatch"
					class:swatch--pill={active.pill}
					class:swatch--navy={selected === 'navy_pill'}
					class:swatch--indigo={selected === 'indigo_pill'}
					style={!active.pill ? `background: ${active.bar}` : undefined}
				>
					<img src={logoNav} alt="" width="420" height="200" />
				</div>
			</figure>
			<figure>
				<figcaption>App mark / icon (questorLog)</figcaption>
				<div
					class="swatch swatch--square"
					class:swatch--pill={active.pill}
					class:swatch--navy={selected === 'navy_pill'}
					class:swatch--indigo={selected === 'indigo_pill'}
					style={!active.pill ? `background: ${active.bar}` : undefined}
				>
					<img src={logoMark} alt="" width="220" height="220" />
				</div>
			</figure>
		</div>

		<div class="login-card">
			<p class="eyebrow">Login mock</p>
			{#if active.pill}
				<div
					class="pill login-pill"
					class:pill--navy={selected === 'navy_pill'}
					class:pill--indigo={selected === 'indigo_pill'}
				>
					<img src={logoNav} alt="QuestorLog" width="280" height="133" />
				</div>
			{:else}
				<img class="login-logo" src={logoNav} alt="QuestorLog" width="280" height="133" />
			{/if}
			<p class="muted">Welcome back — continue with Google or email.</p>
		</div>
	</article>

	<aside class="notes">
		<h2>What to look for</h2>
		<ul>
			<li>Is the grey “QuestorLog” wordmark readable on light backgrounds?</li>
			<li>Does a black artboard show as a rectangle behind the emblem?</li>
			<li>Do the navy/indigo pills make the mark feel more finished?</li>
		</ul>
		<p>
			Tell me which option ID you prefer (<code>app</code>, <code>white</code>, <code>soft</code>,
			<code>dark</code>, <code>navy_pill</code>, or <code>indigo_pill</code>). If black boxes show on
			light options, we should re-export the SVG/PNG with a truly transparent background (no baked
			black fill).
		</p>
	</aside>
</section>

<style>
	.preview {
		max-width: 58rem;
		margin: 0 auto;
		padding: 1.25rem 1rem 3rem;
		display: grid;
		gap: 1.25rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent, #6366f1);
		font-family: var(--font-display, system-ui);
	}

	h1,
	h2 {
		margin: 0.25rem 0 0;
		font-family: var(--font-display, system-ui);
	}

	.lede,
	.muted,
	.notes p,
	.notes li,
	figcaption,
	.stage__label {
		color: var(--text-muted, #64748b);
		line-height: 1.45;
	}

	.chooser {
		display: grid;
		gap: 0.65rem;
	}

	@media (min-width: 720px) {
		.chooser {
			grid-template-columns: 1fr 1fr;
		}
	}

	.chooser button {
		text-align: left;
		display: grid;
		gap: 0.25rem;
		padding: 0.85rem 1rem;
		min-height: 44px;
		border-radius: 0.9rem;
		border: 1px solid var(--border, #e2e8f0);
		background: var(--surface, #fff);
		cursor: pointer;
		font: inherit;
		color: inherit;
	}

	.chooser button strong {
		font-family: var(--font-display, system-ui);
	}

	.chooser button span {
		font-size: 0.88rem;
		color: var(--text-muted, #64748b);
	}

	.chooser button.active {
		border-color: var(--accent, #6366f1);
		outline: 2px solid color-mix(in srgb, var(--accent, #6366f1) 35%, transparent);
	}

	.stage {
		border-radius: 1.2rem;
		padding: 1rem;
		border: 1px solid var(--border, #e2e8f0);
		display: grid;
		gap: 1rem;
	}

	.stage__label {
		margin: 0;
		font-size: 0.85rem;
	}

	.mock-nav {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 4.5rem;
		padding: 0.55rem 0.85rem;
		border-radius: 0.95rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
	}

	.nav-logo,
	.login-logo {
		display: block;
		height: 2.75rem;
		width: auto;
		max-width: min(52vw, 14rem);
		object-fit: contain;
		object-position: left center;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.7rem;
		border-radius: 0.85rem;
	}

	.pill--navy,
	.swatch--navy {
		background: #0b1220;
	}

	.pill--indigo,
	.swatch--indigo {
		background: #312e81;
	}

	.login-pill .nav-logo,
	.login-pill img {
		height: 2.6rem;
	}

	.mock-links {
		display: none;
		gap: 0.85rem;
		margin-left: auto;
		color: #64748b;
		font-size: 0.9rem;
	}

	@media (min-width: 640px) {
		.mock-links {
			display: flex;
		}
	}

	.cards {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 720px) {
		.cards {
			grid-template-columns: 1.2fr 0.8fr;
		}
	}

	figure {
		margin: 0;
		display: grid;
		gap: 0.45rem;
	}

	figcaption {
		font-size: 0.85rem;
	}

	.swatch {
		display: grid;
		place-items: center;
		min-height: 10rem;
		padding: 1rem;
		border-radius: 1rem;
		border: 1px dashed rgba(148, 163, 184, 0.55);
	}

	.swatch img {
		max-width: 100%;
		height: auto;
		object-fit: contain;
	}

	.swatch--square img {
		width: min(100%, 12rem);
	}

	.swatch--pill {
		background: transparent;
		border-style: solid;
	}

	.login-card {
		justify-self: center;
		width: min(100%, 22rem);
		padding: 1.25rem;
		border-radius: 1.15rem;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid rgba(148, 163, 184, 0.35);
		display: grid;
		gap: 0.75rem;
		justify-items: center;
		text-align: center;
	}

	.notes {
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		background: var(--surface, #fff);
		border: 1px solid var(--border, #e2e8f0);
	}

	.notes ul {
		margin: 0.5rem 0;
		padding-left: 1.15rem;
	}

	code {
		font-size: 0.9em;
	}
</style>
