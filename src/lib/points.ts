import type { PointsLedgerEntry } from './types';

/** Start of local calendar day. */
export function startOfLocalDay(date = new Date()): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

/** Start of local week (Monday). */
export function startOfLocalWeek(date = new Date()): Date {
	const d = startOfLocalDay(date);
	const day = d.getDay(); // 0 Sun .. 6 Sat
	const diff = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - diff);
	return d;
}

export function sumPoints(entries: PointsLedgerEntry[]): number {
	return entries.reduce((acc, e) => acc + Number(e.points), 0);
}

export function filterSince(entries: PointsLedgerEntry[], since: Date): PointsLedgerEntry[] {
	const t = since.getTime();
	return entries.filter((e) => new Date(e.created_at).getTime() >= t);
}

export function balanceForParticipant(
	entries: PointsLedgerEntry[],
	participantId: string
): number {
	return sumPoints(entries.filter((e) => e.participant_id === participantId));
}

/** Progress 0–1 toward the nearest unclaimed grand reward threshold. */
export function progressTowardReward(balance: number, required: number): number {
	if (required <= 0) return 0;
	return Math.min(1, Math.max(0, balance / required));
}
