import { supabase } from './supabase';

export async function isFeatureEnabled(
	key: string,
	householdId: string | null = null
): Promise<boolean> {
	const { data, error } = await supabase.rpc('is_feature_enabled', {
		p_key: key,
		p_household_id: householdId
	});
	if (error) {
		console.warn('is_feature_enabled unavailable', error.message);
		return false;
	}
	return Boolean(data);
}

export async function fetchFeatureFlags() {
	const { data, error } = await supabase.from('feature_flags').select('*').order('key');
	if (error) throw error;
	return data ?? [];
}
