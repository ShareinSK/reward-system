import { supabase } from './supabase';
import type { HouseholdEntitlement, PlanLimits } from './types';
import { FREE_LIMITS, PRO_LIMITS } from './types';

export class PlanLimitError extends Error {
	resource: string;
	limit: number;

	constructor(resource: string, limit: number) {
		const label =
			resource === 'members'
				? limit === 1
					? 'guild mate'
					: 'guild mates'
				: resource === 'participants'
					? limit === 1
						? 'questor'
						: 'questors'
					: resource === 'activities'
						? limit === 1
							? 'quest'
							: 'quests'
						: resource === 'rewards'
							? limit === 1
								? 'bounty'
								: 'bounties'
							: resource;
		super(
			`Free plan allows ${limit} ${label}. Upgrade to Pro for higher limits.`
		);
		this.name = 'PlanLimitError';
		this.resource = resource;
		this.limit = limit;
	}
}

export function parsePlanLimitError(message: string): PlanLimitError | null {
	const match = message.match(/PLAN_LIMIT:(\w+):(\d+)/);
	if (!match) return null;
	return new PlanLimitError(match[1], Number(match[2]));
}

export async function fetchEntitlement(householdId: string): Promise<HouseholdEntitlement | null> {
	const { data, error } = await supabase
		.from('household_entitlements')
		.select('*')
		.eq('household_id', householdId)
		.maybeSingle();
	if (error) throw error;
	return data as HouseholdEntitlement | null;
}

export async function fetchPlanLimits(householdId: string): Promise<PlanLimits> {
	const { data, error } = await supabase.rpc('household_plan_limits', {
		p_household_id: householdId
	});
	if (error) {
		// Migration not applied yet — fall back to free
		console.warn('household_plan_limits unavailable', error.message);
		return { ...FREE_LIMITS };
	}
	const row = Array.isArray(data) ? data[0] : data;
	if (!row) return { ...FREE_LIMITS };
	return {
		max_members: Number(row.max_members),
		max_participants: Number(row.max_participants),
		max_activities: Number(row.max_activities),
		max_rewards: Number(row.max_rewards),
		plan: row.plan
	};
}

export async function hasProAccess(householdId: string): Promise<boolean> {
	const { data, error } = await supabase.rpc('household_has_pro_access', {
		p_household_id: householdId
	});
	if (error) {
		console.warn('household_has_pro_access unavailable', error.message);
		return false;
	}
	return Boolean(data);
}

export function isAtCap(count: number, max: number): boolean {
	return count >= max;
}

export function limitsForDisplay(pro: boolean): PlanLimits {
	return pro ? { ...PRO_LIMITS } : { ...FREE_LIMITS };
}

export async function startTrial(days = 15): Promise<HouseholdEntitlement> {
	const { data, error } = await supabase.rpc('start_household_trial', { p_days: days });
	if (error) throw error;
	return data as HouseholdEntitlement;
}
