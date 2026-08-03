// Supabase Edge Function: scheduled notifications (trial + engagement)
// Schedule via Dashboard cron or `supabase functions schedule`
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

type PushSub = { endpoint: string; p256dh: string; auth: string; user_id: string };

async function sendWebPush(
	sub: PushSub,
	payload: { title: string; body: string; url?: string }
) {
	const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
	const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
	const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:feedback@herohabbits.app';
	if (!vapidPublic || !vapidPrivate) return { ok: false, reason: 'no_vapid' };

	// Use web-push compatible approach via fetch to a small helper would be ideal;
	// Deno web-push via esm:
	const webpush = await import('https://esm.sh/web-push@3.6.7');
	webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
	await webpush.sendNotification(
		{
			endpoint: sub.endpoint,
			keys: { p256dh: sub.p256dh, auth: sub.auth }
		},
		JSON.stringify(payload)
	);
	return { ok: true };
}

async function sendEmail(to: string, subject: string, body: string) {
	const resendKey = Deno.env.get('RESEND_API_KEY');
	const from = Deno.env.get('RESEND_FROM') || 'HeroHabbits <onboarding@resend.dev>';
	if (!resendKey) return { ok: false, reason: 'no_resend' };
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${resendKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ from, to: [to], subject, text: body })
	});
	return { ok: res.ok, status: res.status };
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

	const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET');
	if (!serviceKey || !supabaseUrl) {
		return new Response('Not configured', { status: 503 });
	}

	const auth = req.headers.get('Authorization') || '';
	if (cronSecret && auth !== `Bearer ${cronSecret}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	const admin = createClient(supabaseUrl, serviceKey);
	const now = new Date();
	const results: unknown[] = [];

	// Trial reminders: 3d, 1d, expired
	const { data: trials } = await admin
		.from('household_entitlements')
		.select('household_id, plan, trial_ends_at, status')
		.eq('plan', 'trial')
		.not('trial_ends_at', 'is', null);

	for (const t of trials ?? []) {
		const ends = new Date(t.trial_ends_at as string);
		const daysLeft = Math.ceil((ends.getTime() - now.getTime()) / 86400000);
		let templateKey: string | null = null;
		if (daysLeft === 3) templateKey = 'trial_3d';
		else if (daysLeft === 1) templateKey = 'trial_1d';
		else if (daysLeft <= 0) templateKey = 'trial_expired';
		if (!templateKey) continue;

		const { data: owner } = await admin
			.from('household_members')
			.select('user_id')
			.eq('household_id', t.household_id)
			.eq('role', 'owner')
			.maybeSingle();
		if (!owner) continue;

		const { data: profile } = await admin
			.from('profiles')
			.select('id, is_test, email_opt_in, push_opt_in')
			.eq('id', owner.user_id)
			.maybeSingle();
		if (!profile || profile.is_test) continue;

		const { data: already } = await admin
			.from('notification_log')
			.select('id')
			.eq('user_id', owner.user_id)
			.eq('template_key', templateKey)
			.gte('created_at', new Date(now.getTime() - 20 * 3600000).toISOString())
			.limit(1);
		if (already?.length) continue;

		const { data: template } = await admin
			.from('notification_templates')
			.select('*')
			.eq('key', templateKey)
			.eq('enabled', true)
			.maybeSingle();
		if (!template) continue;

		const { data: authUser } = await admin.auth.admin.getUserById(owner.user_id);
		const email = authUser.user?.email;

		if (profile.push_opt_in) {
			const { data: subs } = await admin
				.from('push_subscriptions')
				.select('endpoint, p256dh, auth, user_id')
				.eq('user_id', owner.user_id);
			for (const sub of (subs ?? []) as PushSub[]) {
				try {
					await sendWebPush(sub, {
						title: template.subject || 'HeroHabbits',
						body: template.body,
						url: '/billing/'
					});
				} catch {
					/* ignore bad endpoints */
				}
			}
		}

		if (email && profile.email_opt_in) {
			await sendEmail(email, template.subject || 'HeroHabbits', template.body);
		}

		await admin.from('in_app_notifications').insert({
			user_id: owner.user_id,
			title: template.subject || 'HeroHabbits',
			body: template.body,
			href: '/billing/'
		});

		await admin.from('notification_log').insert({
			user_id: owner.user_id,
			household_id: t.household_id,
			template_key: templateKey,
			channel: 'multi',
			status: 'sent'
		});

		if (templateKey === 'trial_expired') {
			await admin
				.from('household_entitlements')
				.update({ plan: 'free', status: 'expired', updated_at: now.toISOString() })
				.eq('household_id', t.household_id);
		}

		results.push({ templateKey, household_id: t.household_id });
	}

	// Engagement: inactive 3+ days
	const cutoff = new Date(now.getTime() - 3 * 86400000).toISOString();
	const { data: inactive } = await admin
		.from('profiles')
		.select('id, email_opt_in, push_opt_in, is_test, last_active_at')
		.eq('is_test', false)
		.or(`last_active_at.is.null,last_active_at.lt.${cutoff}`)
		.limit(50);

	const { data: engageFlag } = await admin
		.from('feature_flags')
		.select('enabled, rollout')
		.eq('key', 'engagement_push')
		.maybeSingle();

	if (engageFlag?.enabled) {
		const { data: nudge } = await admin
			.from('notification_templates')
			.select('*')
			.eq('key', 'inactive_nudge')
			.eq('enabled', true)
			.maybeSingle();

		for (const p of inactive ?? []) {
			if (!nudge) break;
			const { data: already } = await admin
				.from('notification_log')
				.select('id')
				.eq('user_id', p.id)
				.eq('template_key', 'inactive_nudge')
				.gte('created_at', new Date(now.getTime() - 3 * 86400000).toISOString())
				.limit(1);
			if (already?.length) continue;

			if (p.push_opt_in) {
				const { data: subs } = await admin
					.from('push_subscriptions')
					.select('endpoint, p256dh, auth, user_id')
					.eq('user_id', p.id);
				for (const sub of (subs ?? []) as PushSub[]) {
					try {
						await sendWebPush(sub, {
							title: 'HeroHabbits',
							body: nudge.body,
							url: '/dashboard/'
						});
					} catch {
						/* ignore */
					}
				}
			}

			await admin.from('notification_log').insert({
				user_id: p.id,
				template_key: 'inactive_nudge',
				channel: 'push',
				status: 'sent'
			});
			results.push({ templateKey: 'inactive_nudge', user_id: p.id });
		}
	}

	return new Response(JSON.stringify({ ok: true, results }), {
		headers: { ...cors, 'Content-Type': 'application/json' }
	});
});
