import { supabase } from './supabase';
import type { FeatureFlag } from './types';

/** Short admin labels keyed by snake_case flag id. */
const FLAG_LABELS: Record<string, string> = {
	goals_theme: 'Goals theme',
	billing_checkout: 'Billing checkout',
	billing_pricing: 'Billing & pricing UI',
	engagement_emails: 'Engagement emails',
	engagement_push: 'Engagement push',
	weekly_digest: 'Weekly digest'
};

export function flagLabel(flag: Pick<FeatureFlag, 'key' | 'description'>): string {
	if (FLAG_LABELS[flag.key]) return FLAG_LABELS[flag.key];
	if (flag.description?.trim()) return flag.description.trim();
	return flag.key
		.split('_')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

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
