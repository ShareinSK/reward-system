import { supabase } from './supabase';
import type { AppRole, Profile } from './types';

function asProfile(row: Record<string, unknown>, fallbackRole: AppRole = 'user'): Profile {
	return {
		id: String(row.id),
		display_name: String(row.display_name ?? ''),
		active_household_id: (row.active_household_id as string | null) ?? null,
		app_role: (row.app_role as AppRole | undefined) ?? fallbackRole,
		is_test: Boolean(row.is_test ?? false),
		email_opt_in: row.email_opt_in !== false,
		push_opt_in: row.push_opt_in !== false,
		last_active_at: (row.last_active_at as string | null) ?? null,
		onboarding_completed_at: (row.onboarding_completed_at as string | null) ?? null
	};
}

export async function fetchMyProfile(): Promise<Profile | null> {
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return null;

	const full = await supabase
		.from('profiles')
		.select(
			'id, display_name, active_household_id, app_role, is_test, email_opt_in, push_opt_in, last_active_at, onboarding_completed_at'
		)
		.eq('id', user.id)
		.maybeSingle();

	if (!full.error && full.data) {
		return asProfile(full.data as Record<string, unknown>);
	}

	// Older schemas may lack onboarding_completed_at — keep app_role
	const mid = await supabase
		.from('profiles')
		.select(
			'id, display_name, active_household_id, app_role, is_test, email_opt_in, push_opt_in, last_active_at'
		)
		.eq('id', user.id)
		.maybeSingle();

	if (!mid.error && mid.data) {
		return asProfile(mid.data as Record<string, unknown>);
	}

	const roleOnly = await supabase
		.from('profiles')
		.select('id, display_name, active_household_id, app_role')
		.eq('id', user.id)
		.maybeSingle();

	if (!roleOnly.error && roleOnly.data) {
		return asProfile(roleOnly.data as Record<string, unknown>);
	}

	console.warn(
		'fetchMyProfile degraded',
		full.error?.message ?? mid.error?.message ?? roleOnly.error?.message
	);

	const basic = await supabase
		.from('profiles')
		.select('id, display_name, active_household_id')
		.eq('id', user.id)
		.maybeSingle();

	if (!basic.data) return null;
	return asProfile(basic.data as Record<string, unknown>, 'user');
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
