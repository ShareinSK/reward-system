<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<section class="legal">
	<p class="eyebrow">Legal</p>
	<h1>Terms of Service</h1>
	<p class="muted">Last updated: August 2, 2026</p>

	<p>
		By using QuestorLog you agree to these terms. If you do not agree, do not use the service.
	</p>

	<h2>Accounts</h2>
	<p>
		You must be 13 or older to create an account. You are responsible for activity under your
		account and for keeping login credentials secure. Guild owners control invites and billing.
	</p>

	<h2>Acceptable use</h2>
	<p>
		Do not abuse the service, attempt to bypass plan limits, harass others, or upload unlawful
		content. We may suspend guilds that violate these terms.
	</p>

	<h2>Plans & billing</h2>
	<p>
		Free and Pro limits are described in the app. Paid subscriptions (when enabled) renew monthly
		until canceled via the Stripe customer portal. Trials convert to Free unless you subscribe.
		Prices may vary by country.
	</p>

	<h2>Refunds</h2>
	<p>
		If a charge was made in error, contact us within 14 days. Refunds for unused subscription time
		are handled case-by-case during soft launch.
	</p>

	<h2>Disclaimer</h2>
	<p>
		QuestorLog is provided “as is” during community soft launch. We work to keep the service
		available but do not guarantee uninterrupted uptime.
	</p>

	<h2>Contact</h2>
	<p>Use the <a href={resolve('/feedback/')}>feedback form</a> for support requests.</p>

	<p><a href={resolve('/')}>Back</a> · <a href={resolve('/privacy/')}>Privacy</a></p>
</section>

<style>
	.legal {
		max-width: 42rem;
		display: grid;
		gap: 0.75rem;
		line-height: 1.55;
		color: var(--text);
	}
	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
		font-family: var(--font-display);
	}
	h1,
	h2 {
		font-family: var(--font-display);
		margin: 0.5rem 0 0;
	}
	.muted {
		color: var(--text-soft);
		margin: 0;
	}
	a {
		color: var(--accent-bright);
	}
</style>
