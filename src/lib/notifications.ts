import { supabase } from './supabase';

const VAPID_PUBLIC = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
	return output;
}

export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export async function registerPushSubscription(): Promise<boolean> {
	if (!pushSupported() || !VAPID_PUBLIC) return false;

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return false;

	const reg = await navigator.serviceWorker.ready;
	let sub = await reg.pushManager.getSubscription();
	if (!sub) {
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
		});
	}

	const json = sub.toJSON();
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

	const { error } = await supabase.from('push_subscriptions').upsert(
		{
			user_id: user.id,
			endpoint: json.endpoint,
			p256dh: json.keys.p256dh,
			auth: json.keys.auth,
			user_agent: navigator.userAgent
		},
		{ onConflict: 'user_id,endpoint' }
	);
	if (error) throw error;

	await supabase.from('profiles').update({ push_opt_in: true }).eq('id', user.id);
	return true;
}

export async function fetchInAppNotifications(limit = 20) {
	const { data, error } = await supabase
		.from('in_app_notifications')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(limit);
	if (error) throw error;
	return data ?? [];
}

export async function markNotificationRead(id: string) {
	const { error } = await supabase
		.from('in_app_notifications')
		.update({ read_at: new Date().toISOString() })
		.eq('id', id);
	if (error) throw error;
}
