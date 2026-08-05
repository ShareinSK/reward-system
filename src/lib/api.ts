import { ensureHouseholdId } from './household';
import { requireHouseholdId } from './householdStore';
import { supabase } from './supabase';
import type {
	Activity,
	ActivityMeta,
	AiLogPreview,
	GrandReward,
	Participant,
	ParticipantMeta,
	PointsLedgerEntry
} from './types';

async function householdId(): Promise<string> {
	return requireHouseholdId(ensureHouseholdId);
}

export async function fetchActivities(): Promise<Activity[]> {
	const hid = await householdId();
	const { data, error } = await supabase
		.from('activities')
		.select('*')
		.eq('household_id', hid)
		.order('title', { ascending: true });
	if (error) throw error;
	return (data ?? []).map((row) => ({
		...(row as Activity),
		time_of_day:
			row.time_of_day === 'morning' ||
			row.time_of_day === 'afternoon' ||
			row.time_of_day === 'evening' ||
			row.time_of_day === 'night' ||
			row.time_of_day === 'all_day'
				? row.time_of_day
				: 'all_day',
		assignee_participant_id: (row.assignee_participant_id as string | null) ?? null
	})) as Activity[];
}

export async function fetchGrandRewards(): Promise<GrandReward[]> {
	const hid = await householdId();
	const { data, error } = await supabase
		.from('grand_rewards')
		.select('*')
		.eq('household_id', hid)
		.order('points_required', { ascending: true });
	if (error) throw error;
	return (data ?? []) as GrandReward[];
}

export async function fetchParticipants(): Promise<Participant[]> {
	const hid = await householdId();
	const { data, error } = await supabase
		.from('participants')
		.select('*')
		.eq('household_id', hid)
		.order('name', { ascending: true });
	if (error) throw error;
	return (data ?? []) as Participant[];
}

export async function fetchLedger(limit = 200): Promise<PointsLedgerEntry[]> {
	const hid = await householdId();
	const { data, error } = await supabase
		.from('points_ledger')
		.select('*')
		.eq('household_id', hid)
		.order('created_at', { ascending: false })
		.limit(limit);
	if (error) throw error;
	return (data ?? []) as PointsLedgerEntry[];
}

export async function insertLedgerEntry(entry: {
	participant_id: string;
	activity_id?: string | null;
	grand_reward_id?: string | null;
	points: number;
	note?: string;
	client_request_id?: string | null;
}): Promise<PointsLedgerEntry> {
	const hid = await householdId();
	const {
		data: { user }
	} = await supabase.auth.getUser();

	const payload: Record<string, unknown> = {
		participant_id: entry.participant_id,
		activity_id: entry.activity_id ?? null,
		grand_reward_id: entry.grand_reward_id ?? null,
		points: entry.points,
		household_id: hid,
		note: entry.note ?? '',
		created_by: user?.id ?? null
	};
	if (entry.client_request_id) {
		payload.client_request_id = entry.client_request_id;
	}

	const { data, error } = await supabase
		.from('points_ledger')
		.insert(payload)
		.select('*')
		.single();

	if (error) throw error;
	return data as PointsLedgerEntry;
}

export async function claimGrandReward(
	participantId: string,
	reward: GrandReward
): Promise<PointsLedgerEntry> {
	return insertLedgerEntry({
		participant_id: participantId,
		grand_reward_id: reward.id,
		points: -Number(reward.points_required),
		note: `Claimed bounty: ${reward.title}`
	});
}

export async function parsePointsWithAi(
	text: string,
	participants: ParticipantMeta[],
	activities: ActivityMeta[]
): Promise<AiLogPreview> {
	const { data, error } = await supabase.functions.invoke('parse-points-log', {
		body: {
			text,
			participants: JSON.parse(JSON.stringify(participants)),
			activities: JSON.parse(JSON.stringify(activities))
		}
	});

	if (error) throw error;
	if (data?.error) throw new Error(data.error);
	return data as AiLogPreview;
}
