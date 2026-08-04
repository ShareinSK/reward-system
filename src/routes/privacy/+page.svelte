<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<section class="legal">
	<p class="eyebrow">Legal</p>
	<h1>Privacy Policy</h1>
	<p class="muted">Last updated: August 2, 2026</p>

	<p>
		QuestorLog (“we”, “us”) provides a guild habit, bounty, and quest tracking service. This
		policy explains what we collect and how we use it.
	</p>

	<h2>Who the product is for</h2>
	<p>
		Accounts are for adults (parents/guardians, age 13+). Children participate as named profiles
		inside a guild and do not create their own login accounts.
	</p>

	<h2>Information we collect</h2>
	<ul>
		<li>Account data: email, display name, authentication identifiers</li>
		<li>Guild data: questors, quests, bounties, XP ledger</li>
		<li>Usage data: last active time, optional notification preferences</li>
		<li>Billing data (when subscriptions are enabled): handled by Stripe; we store subscription status IDs</li>
		<li>Push subscription endpoints if you enable Web Push</li>
	</ul>

	<h2>How we use information</h2>
	<ul>
		<li>Provide and improve the service</li>
		<li>Send transactional messages (account, trial, billing)</li>
		<li>Send optional engagement reminders if you opt in</li>
		<li>Prevent abuse and enforce plan limits</li>
	</ul>

	<h2>Sharing</h2>
	<p>
		We use infrastructure providers such as Supabase (database/auth) and, when enabled, Stripe
		(payments) and an email/push delivery provider. We do not sell personal data.
	</p>

	<h2>Retention & deletion</h2>
	<p>
		You may request account deletion by contacting us. We will delete or anonymize guild data
		we control, subject to legal retention needs (for example billing records).
	</p>

	<h2>Contact</h2>
	<p>
		Questions: use the <a href={resolve('/feedback/')}>feedback form</a> or email the address listed
		there.
	</p>

	<p><a href={resolve('/')}>Back</a> · <a href={resolve('/terms/')}>Terms</a></p>
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
