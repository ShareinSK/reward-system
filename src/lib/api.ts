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
	return (data ?? []) as Activity[];
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
}): Promise<PointsLedgerEntry> {
	const hid = await householdId();
	const {
		data: { user }
	} = await supabase.auth.getUser();

	const { data, error } = await supabase
		.from('points_ledger')
		.insert({
			...entry,
			household_id: hid,
			note: entry.note ?? '',
			created_by: user?.id ?? null
		})
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
		note: `Claimed: ${reward.title}`
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
