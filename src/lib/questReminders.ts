import type { Activity, Participant, PointsLedgerEntry, TimeOfDay } from './types';

/** Local hour (0–23) when end-of-window reminders fire. */
export const PERIOD_END_HOUR: Record<TimeOfDay, number> = {
	morning: 11,
	afternoon: 16,
	evening: 20,
	night: 22,
	all_day: 20
};

export function normalizeTimeOfDay(value: unknown): TimeOfDay {
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

export function timeOfDayLabel(value: TimeOfDay): string {
	switch (value) {
		case 'morning':
			return 'Morning';
		case 'afternoon':
			return 'Afternoon';
		case 'evening':
			return 'Evening';
		case 'night':
			return 'Night';
		default:
			return 'All day';
	}
}

/** Periods whose end-of-window hour matches `localHour`. */
export function periodsEndingAtHour(localHour: number): TimeOfDay[] {
	return (Object.keys(PERIOD_END_HOUR) as TimeOfDay[]).filter(
		(period) => PERIOD_END_HOUR[period] === localHour
	);
}

export type LocalClock = { dateKey: string; hour: number };

/** Household-local calendar date (YYYY-MM-DD) and hour. */
export function localClockInTimezone(timeZone: string, now = new Date()): LocalClock {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	const year = get('year');
	const month = get('month');
	const day = get('day');
	const hour = Number(get('hour'));
	return { dateKey: `${year}-${month}-${day}`, hour: Number.isFinite(hour) ? hour : 0 };
}

/** UTC instant for local midnight of `dateKey` (YYYY-MM-DD) in `timeZone`. */
export function startOfLocalDayUtc(dateKey: string, timeZone: string): Date {
	const [y, m, d] = dateKey.split('-').map(Number);
	// Start from UTC midnight of that calendar date, then adjust by observed zone offset.
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

export type IncompletePair = {
	activity: Activity;
	participant: Participant;
};

/** Pending offline awards counted as done for local reminder checks. */
export type PendingAwardLike = {
	activity_id: string;
	participant_id: string;
};

function relevantParticipants(
	activity: Activity,
	participants: Participant[]
): Participant[] {
	if (activity.assignee_participant_id) {
		return participants.filter((p) => p.id === activity.assignee_participant_id);
	}
	return participants;
}

function hasCompletionToday(
	activityId: string,
	participantId: string,
	ledger: PointsLedgerEntry[],
	dayStartMs: number,
	pending: PendingAwardLike[]
): boolean {
	if (
		pending.some((p) => p.activity_id === activityId && p.participant_id === participantId)
	) {
		return true;
	}
	return ledger.some(
		(e) =>
			e.activity_id === activityId &&
			e.participant_id === participantId &&
			new Date(e.created_at).getTime() >= dayStartMs
	);
}

export function findIncompletePairs(params: {
	activities: Activity[];
	participants: Participant[];
	ledger: PointsLedgerEntry[];
	periods: TimeOfDay[];
	dayStartMs: number;
	pending?: PendingAwardLike[];
}): IncompletePair[] {
	const pending = params.pending ?? [];
	const periodSet = new Set(params.periods);
	const incomplete: IncompletePair[] = [];

	for (const activity of params.activities) {
		const tod = normalizeTimeOfDay(activity.time_of_day);
		if (!periodSet.has(tod)) continue;
		for (const participant of relevantParticipants(activity, params.participants)) {
			if (
				!hasCompletionToday(
					activity.id,
					participant.id,
					params.ledger,
					params.dayStartMs,
					pending
				)
			) {
				incomplete.push({ activity, participant });
			}
		}
	}
	return incomplete;
}

/** e.g. "3 quests still open for Ava, 1 for Noah" */
export function summarizeIncomplete(pairs: IncompletePair[]): string {
	if (!pairs.length) return '';
	const byPerson = new Map<string, { name: string; count: number }>();
	for (const { participant } of pairs) {
		const cur = byPerson.get(participant.id);
		if (cur) cur.count += 1;
		else byPerson.set(participant.id, { name: participant.name, count: 1 });
	}
	const parts = [...byPerson.values()].map(({ name, count }) => {
		const questLabel = count === 1 ? 'quest' : 'quests';
		return `${count} ${questLabel} still open for ${name}`;
	});
	if (parts.length === 1) return parts[0];
	if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
	return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export function localReminderStorageKey(
	householdId: string,
	dateKey: string,
	period: TimeOfDay
): string {
	return `quest-local-reminder:${householdId}:${dateKey}:${period}`;
}
