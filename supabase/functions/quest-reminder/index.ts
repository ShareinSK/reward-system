// Supabase Edge Function: quest-reminder
// Hourly cron (GitHub Actions or pg_cron) should POST with:
//   Authorization: Bearer <NOTIFICATION_CRON_SECRET>
// Deploy with JWT verification disabled:
//   supabase functions deploy quest-reminder --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

type PushSub = { endpoint: string; p256dh: string; auth: string; user_id: string };

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night' | 'all_day';

const PERIOD_END_HOUR: Record<TimeOfDay, number> = {
	morning: 11,
	afternoon: 16,
	evening: 20,
	night: 22,
	all_day: 20
};

function periodsEndingAtHour(localHour: number): TimeOfDay[] {
	return (Object.keys(PERIOD_END_HOUR) as TimeOfDay[]).filter(
		(period) => PERIOD_END_HOUR[period] === localHour
	);
}

function localClockInTimezone(timeZone: string, now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return {
		dateKey: `${get('year')}-${get('month')}-${get('day')}`,
		hour: Number(get('hour')) || 0
	};
}

function startOfLocalDayUtc(dateKey: string, timeZone: string): Date {
	const [y, m, d] = dateKey.split('-').map(Number);
	let guess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
	for (let i = 0; i < 4; i++) {
		const clock = localClockInTimezone(timeZone, new Date(guess));
		const [cy, cm, cd] = clock.dateKey.split('-').map(Number);
		const localAsUtc = Date.UTC(cy, cm - 1, cd, clock.hour, 0, 0, 0);
		const desiredAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
		const delta = localAsUtc - desiredAsUtc;
		if (delta === 0 && clock.dateKey === dateKey && clock.hour === 0) break;
		guess -= delta;
	}
	return new Date(guess);
}

function normalizeTimeOfDay(value: unknown): TimeOfDay {
	if (
		value === 'morning' ||
		value === 'afternoon' ||
		value === 'evening' ||
		value === 'night' ||
		value === 'all_day'
	) {
		return value;
	}
	return 'all_day';
}

function summarize(countsByName: Map<string, number>): string {
	const parts = [...countsByName.entries()].map(([name, count]) => {
		const questLabel = count === 1 ? 'quest' : 'quests';
		return `${count} ${questLabel} still open for ${name}`;
	});
	if (parts.length === 1) return parts[0];
	if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
	return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

async function sendWebPush(
	sub: PushSub,
	payload: { title: string; body: string; url?: string }
) {
	const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
	const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
	const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:feedback@questorlog.app';
	if (!vapidPublic || !vapidPrivate) return { ok: false, reason: 'no_vapid' };

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
	const from = Deno.env.get('RESEND_FROM') || 'QuestorLog <onboarding@questorlog.app>';
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
						title: template.subject || 'QuestorLog',
						body: template.body,
						url: '/billing/'
					});
				} catch {
					/* ignore bad endpoints */
				}
			}
		}

		if (email && profile.email_opt_in) {
			await sendEmail(email, template.subject || 'QuestorLog', template.body);
		}

		await admin.from('in_app_notifications').insert({
			user_id: owner.user_id,
			title: template.subject || 'QuestorLog',
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
							title: 'QuestorLog',
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

	// Incomplete quest reminders (end of morning/afternoon/evening/night/all_day windows)
	const { data: questTemplate } = await admin
		.from('notification_templates')
		.select('*')
		.eq('key', 'quest_incomplete_reminder')
		.eq('enabled', true)
		.maybeSingle();

	if (questTemplate) {
		const { data: households } = await admin
			.from('households')
			.select('id, timezone')
			.eq('disabled', false);

		for (const hh of households ?? []) {
			const timeZone =
				typeof hh.timezone === 'string' && hh.timezone.trim()
					? hh.timezone.trim()
					: 'America/Chicago';
			const clock = localClockInTimezone(timeZone, now);
			const periods = periodsEndingAtHour(clock.hour);
			if (!periods.length) continue;

			const dayStart = startOfLocalDayUtc(clock.dateKey, timeZone);
			const dayStartIso = dayStart.toISOString();

			const { data: activities } = await admin
				.from('activities')
				.select('id, title, time_of_day, assignee_participant_id')
				.eq('household_id', hh.id)
				.in('time_of_day', periods);

			if (!activities?.length) continue;

			const { data: participants } = await admin
				.from('participants')
				.select('id, name')
				.eq('household_id', hh.id);

			if (!participants?.length) continue;

			const { data: ledgerRows } = await admin
				.from('points_ledger')
				.select('activity_id, participant_id')
				.eq('household_id', hh.id)
				.not('activity_id', 'is', null)
				.gte('created_at', dayStartIso);

			const done = new Set(
				(ledgerRows ?? []).map((r) => `${r.activity_id}:${r.participant_id}`)
			);

			const countsByName = new Map<string, number>();
			for (const activity of activities) {
				const tod = normalizeTimeOfDay(activity.time_of_day);
				if (!periods.includes(tod)) continue;
				const relevant = activity.assignee_participant_id
					? participants.filter((p) => p.id === activity.assignee_participant_id)
					: participants;
				for (const person of relevant) {
					if (done.has(`${activity.id}:${person.id}`)) continue;
					countsByName.set(person.name, (countsByName.get(person.name) ?? 0) + 1);
				}
			}

			if (!countsByName.size) continue;

			const summary = summarize(countsByName);
			const body = String(questTemplate.body || '{{summary}}').replaceAll(
				'{{summary}}',
				summary
			);
			const title = questTemplate.subject || 'Quests still open';
			const primaryPeriod = periods[0];

			const { data: members } = await admin
				.from('household_members')
				.select('user_id')
				.eq('household_id', hh.id);

			for (const member of members ?? []) {
				const { data: profile } = await admin
					.from('profiles')
					.select('id, is_test, push_opt_in')
					.eq('id', member.user_id)
					.maybeSingle();
				if (!profile || profile.is_test || !profile.push_opt_in) continue;

				const { data: already } = await admin
					.from('notification_log')
					.select('id')
					.eq('user_id', member.user_id)
					.eq('household_id', hh.id)
					.eq('template_key', 'quest_incomplete_reminder')
					.contains('meta', {
						local_date: clock.dateKey,
						period: primaryPeriod
					})
					.limit(1);
				if (already?.length) continue;

				const { data: subs } = await admin
					.from('push_subscriptions')
					.select('endpoint, p256dh, auth, user_id')
					.eq('user_id', member.user_id);

				let sent = false;
				for (const sub of (subs ?? []) as PushSub[]) {
					try {
						await sendWebPush(sub, {
							title,
							body,
							url: '/dashboard/'
						});
						sent = true;
					} catch {
						/* ignore */
					}
				}

				await admin.from('in_app_notifications').insert({
					user_id: member.user_id,
					title,
					body,
					href: '/dashboard/'
				});

				await admin.from('notification_log').insert({
					user_id: member.user_id,
					household_id: hh.id,
					template_key: 'quest_incomplete_reminder',
					channel: sent ? 'push' : 'in_app',
					status: 'sent',
					meta: {
						local_date: clock.dateKey,
						period: primaryPeriod,
						periods,
						summary
					}
				});

				results.push({
					templateKey: 'quest_incomplete_reminder',
					household_id: hh.id,
					user_id: member.user_id,
					periods
				});
			}
		}
	}

	return new Response(JSON.stringify({ ok: true, results }), {
		headers: { ...cors, 'Content-Type': 'application/json' }
	});
});
