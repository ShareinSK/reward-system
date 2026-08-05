import { base, resolve } from '$app/paths';
import {
	fetchActivities,
	fetchLedger,
	fetchParticipants
} from './api';
import { ensureHouseholdId, fetchHousehold } from './household';
import { setActiveHouseholdId } from './householdStore';
import { listPendingAwards } from './offlineAwards';
import {
	findIncompletePairs,
	localClockInTimezone,
	localReminderStorageKey,
	periodsEndingAtHour,
	startOfLocalDayUtc,
	summarizeIncomplete
} from './questReminders';

async function showLocalNotification(title: string, body: string) {
	if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
	if (Notification.permission !== 'granted') return;

	const path = resolve('/dashboard/');
	const absolute = `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;

	try {
		const reg = await navigator.serviceWorker?.ready;
		if (reg?.showNotification) {
			await reg.showNotification(title, {
				body,
				icon: `${base}/pwa/icon-192.png`,
				badge: `${base}/pwa/icon-192.png`,
				data: { url: path }
			});
			return;
		}
	} catch {
		/* fall through */
	}

	new Notification(title, { body, data: { url: absolute } });
}

/** Check incomplete quests for the current household and notify once per local window. */
export async function maybeShowLocalQuestReminder(): Promise<void> {
	if (typeof window === 'undefined') return;
	if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
	if (document.visibilityState === 'hidden') return;

	try {
		const hid = await ensureHouseholdId();
		setActiveHouseholdId(hid);
		const household = await fetchHousehold(hid);
		const timeZone = household.timezone || 'America/Chicago';
		const clock = localClockInTimezone(timeZone);
		const periods = periodsEndingAtHour(clock.hour);
		if (!periods.length) return;

		// Prefer evening over all_day for shared-hour dedupe key consistency with server
		const primaryPeriod = periods[0];
		const storageKey = localReminderStorageKey(hid, clock.dateKey, primaryPeriod);
		if (localStorage.getItem(storageKey)) return;

		const [activities, participants, ledger, pending] = await Promise.all([
			fetchActivities(),
			fetchParticipants(),
			fetchLedger(500),
			listPendingAwards(hid)
		]);

		const dayStartMs = startOfLocalDayUtc(clock.dateKey, timeZone).getTime();
		const pairs = findIncompletePairs({
			activities,
			participants,
			ledger,
			periods,
			dayStartMs,
			pending: pending.map((p) => ({
				activity_id: p.activity_id,
				participant_id: p.participant_id
			}))
		});
		if (!pairs.length) return;

		const summary = summarizeIncomplete(pairs);
		await showLocalNotification('Quests still open', summary);
		localStorage.setItem(storageKey, '1');
	} catch {
		/* ignore offline / auth errors during local reminder checks */
	}
}

export function startLocalQuestReminderLoop(): () => void {
	if (typeof window === 'undefined') return () => {};

	let stopped = false;
	const tick = () => {
		if (!stopped) void maybeShowLocalQuestReminder();
	};

	tick();
	const interval = window.setInterval(tick, 3 * 60 * 1000);
	const onVis = () => {
		if (document.visibilityState === 'visible') tick();
	};
	window.addEventListener('focus', tick);
	document.addEventListener('visibilitychange', onVis);

	return () => {
		stopped = true;
		window.clearInterval(interval);
		window.removeEventListener('focus', tick);
		document.removeEventListener('visibilitychange', onVis);
	};
}
