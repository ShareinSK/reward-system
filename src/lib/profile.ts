import { supabase } from './supabase';
import type { AppRole, Profile } from './types';

export async function fetchMyProfile(): Promise<Profile | null> {
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return null;

	const { data, error } = await supabase
		.from('profiles')
		.select(
			'id, display_name, active_household_id, app_role, is_test, email_opt_in, push_opt_in, last_active_at'
		)
		.eq('id', user.id)
		.maybeSingle();

	if (error) {
		// Columns may not exist until migration is applied
		const { data: basic } = await supabase
			.from('profiles')
			.select('id, display_name, active_household_id')
			.eq('id', user.id)
			.maybeSingle();
		if (!basic) return null;
		return {
			id: basic.id,
			display_name: basic.display_name,
			active_household_id: basic.active_household_id,
			app_role: 'user',
			is_test: false,
			email_opt_in: true,
			push_opt_in: true,
			last_active_at: null
		};
	}

	return data as Profile;
}

export function isStaffRole(role: AppRole | undefined | null): boolean {
	return role === 'admin' || role === 'super_admin';
}

export async function adminSetEntitlement(params: {
	householdId: string;
	plan: 'free' | 'trial' | 'pro';
	adminOverride?: boolean;
	trialEndsAt?: string | null;
	notes?: string | null;
}) {
	const { data, error } = await supabase.rpc('admin_set_entitlement', {
		p_household_id: params.householdId,
		p_plan: params.plan,
		p_admin_override: params.adminOverride ?? false,
		p_trial_ends_at: params.trialEndsAt ?? null,
		p_notes: params.notes ?? null
	});
	if (error) throw error;
	return data;
}

export async function adminSetProfileFlags(params: {
	userId: string;
	appRole?: AppRole | null;
	isTest?: boolean | null;
}) {
	const { data, error } = await supabase.rpc('admin_set_profile_flags', {
		p_user_id: params.userId,
		p_app_role: params.appRole ?? null,
		p_is_test: params.isTest ?? null
	});
	if (error) throw error;
	return data;
}
