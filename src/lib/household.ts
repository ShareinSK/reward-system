import { supabase } from './supabase';
import type { Household, HouseholdMember, HouseholdSettings } from './types';
import { settingsFromHousehold } from './settings';

/** Ensure the signed-in user has an active household; returns its id. */
export async function ensureHouseholdId(): Promise<string> {
	const { data, error } = await supabase.rpc('ensure_my_household');
	if (error) throw error;
	return data as string;
}

export async function fetchHousehold(householdId: string): Promise<Household> {
	const { data, error } = await supabase
		.from('households')
		.select('*')
		.eq('id', householdId)
		.single();
	if (error) throw error;
	const row = data as Partial<Household> & { id: string; name: string; invite_code: string };
	return {
		id: row.id,
		name: row.name,
		invite_code: row.invite_code,
		allow_negative_points: Boolean(row.allow_negative_points),
		allow_decimal_points: Boolean(row.allow_decimal_points),
		experience_mode: row.experience_mode === 'goals' ? 'goals' : 'kids',
		disabled: Boolean(row.disabled),
		created_by: row.created_by ?? null,
		created_at: row.created_at ?? new Date().toISOString()
	};
}

export async function updateExperienceMode(
	householdId: string,
	mode: Household['experience_mode']
): Promise<void> {
	const { error } = await supabase
		.from('households')
		.update({ experience_mode: mode })
		.eq('id', householdId);
	if (error) throw error;
}

export async function fetchHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
	const { data: rows, error } = await supabase
		.from('household_members')
		.select('household_id, user_id, role, joined_at')
		.eq('household_id', householdId)
		.order('joined_at', { ascending: true });
	if (error) throw error;

	const members = rows ?? [];
	const ids = members.map((m) => m.user_id as string);
	const nameById = new Map<string, string>();

	if (ids.length) {
		const { data: profiles, error: profileError } = await supabase
			.from('profiles')
			.select('id, display_name')
			.in('id', ids);
		if (profileError) throw profileError;
		for (const p of profiles ?? []) {
			nameById.set(p.id as string, (p.display_name as string) || 'Member');
		}
	}

	return members.map((row) => ({
		household_id: row.household_id as string,
		user_id: row.user_id as string,
		role: row.role as HouseholdMember['role'],
		joined_at: row.joined_at as string,
		display_name: nameById.get(row.user_id as string) ?? 'Member'
	}));
}

export async function joinHouseholdByCode(code: string): Promise<string> {
	const { data, error } = await supabase.rpc('join_household_by_code', {
		p_code: code.trim()
	});
	if (error) throw error;
	return data as string;
}

export async function rotateInviteCode(): Promise<string> {
	const { data, error } = await supabase.rpc('rotate_household_invite_code');
	if (error) throw error;
	return data as string;
}

export async function renameHousehold(householdId: string, name: string): Promise<void> {
	const { error } = await supabase
		.from('households')
		.update({ name: name.trim() })
		.eq('id', householdId);
	if (error) throw error;
}

export async function fetchHouseholdSettings(householdId: string): Promise<HouseholdSettings> {
	const household = await fetchHousehold(householdId);
	return settingsFromHousehold(household);
}

export async function updateHouseholdSettings(
	householdId: string,
	settings: HouseholdSettings
): Promise<HouseholdSettings> {
	const { data, error } = await supabase
		.from('households')
		.update({
			allow_negative_points: settings.allow_negative_points,
			allow_decimal_points: settings.allow_decimal_points
		})
		.eq('id', householdId)
		.select('*')
		.single();
	if (error) throw error;
	return settingsFromHousehold(data as Household);
}
