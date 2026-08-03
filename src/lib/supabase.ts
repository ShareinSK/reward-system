import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

function readConfig() {
	const url = env.PUBLIC_SUPABASE_URL?.trim() ?? '';
	const anonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
	return { url, anonKey };
}

export function getSupabaseConfigError(): string | null {
	const { url, anonKey } = readConfig();
	if (!url || !anonKey) {
		return 'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY. Add them as GitHub Actions secrets and rebuild, or set them in .env for local development.';
	}
	if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url) && !url.includes('supabase.co')) {
		return 'PUBLIC_SUPABASE_URL does not look like a valid Supabase project URL.';
	}
	return null;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
	if (client) return client;
	const configError = getSupabaseConfigError();
	if (configError) throw new Error(configError);
	const { url, anonKey } = readConfig();
	client = createClient(url, anonKey, {
		auth: {
			detectSessionInUrl: true,
			persistSession: true,
			flowType: 'pkce'
		}
	});
	return client;
}

/** Lazy proxy so importing this module never crashes at load time. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
	get(_target, prop, receiver) {
		const value = Reflect.get(getSupabase(), prop, receiver);
		return typeof value === 'function' ? value.bind(getSupabase()) : value;
	}
});
