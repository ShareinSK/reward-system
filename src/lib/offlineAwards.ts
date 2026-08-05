import { insertLedgerEntry } from './api';
import type { Activity, HouseholdSettings, Participant } from './types';

const DB_NAME = 'questorlog-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'dashboard_cache';
const STORE_QUEUE = 'pending_awards';

export type PendingAward = {
	client_request_id: string;
	participant_id: string;
	activity_id: string;
	points: number;
	note: string;
	household_id: string;
	created_at_iso: string;
};

export type DashboardCache = {
	household_id: string;
	activities: Activity[];
	participants: Participant[];
	settings: HouseholdSettings;
	saved_at: string;
};

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_CACHE)) {
				db.createObjectStore(STORE_CACHE, { keyPath: 'household_id' });
			}
			if (!db.objectStoreNames.contains(STORE_QUEUE)) {
				db.createObjectStore(STORE_QUEUE, { keyPath: 'client_request_id' });
			}
		};
	});
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
	});
}

function toPlainClone<T>(value: T): T {
	// Svelte $state proxies are not structured-cloneable for IndexedDB.
	return JSON.parse(JSON.stringify(value)) as T;
}

export async function saveDashboardCache(cache: DashboardCache): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const plain = toPlainClone(cache);
	const db = await openDb();
	try {
		const tx = db.transaction(STORE_CACHE, 'readwrite');
		await idbReq(tx.objectStore(STORE_CACHE).put(plain));
	} finally {
		db.close();
	}
}

export async function loadDashboardCache(householdId: string): Promise<DashboardCache | null> {
	if (typeof indexedDB === 'undefined') return null;
	const db = await openDb();
	try {
		const tx = db.transaction(STORE_CACHE, 'readonly');
		const row = await idbReq<DashboardCache | undefined>(
			tx.objectStore(STORE_CACHE).get(householdId)
		);
		return row ?? null;
	} finally {
		db.close();
	}
}

export async function enqueuePendingAwards(awards: PendingAward[]): Promise<void> {
	if (typeof indexedDB === 'undefined' || !awards.length) return;
	const plainAwards = toPlainClone(awards);
	const db = await openDb();
	try {
		const tx = db.transaction(STORE_QUEUE, 'readwrite');
		const store = tx.objectStore(STORE_QUEUE);
		for (const award of plainAwards) {
			store.put(award);
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error ?? new Error('enqueue failed'));
		});
	} finally {
		db.close();
	}
}

export async function listPendingAwards(householdId?: string): Promise<PendingAward[]> {
	if (typeof indexedDB === 'undefined') return [];
	const db = await openDb();
	try {
		const tx = db.transaction(STORE_QUEUE, 'readonly');
		const all = await idbReq<PendingAward[]>(tx.objectStore(STORE_QUEUE).getAll());
		if (!householdId) return all ?? [];
		return (all ?? []).filter((a) => a.household_id === householdId);
	} finally {
		db.close();
	}
}

export async function removePendingAward(clientRequestId: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const db = await openDb();
	try {
		const tx = db.transaction(STORE_QUEUE, 'readwrite');
		await idbReq(tx.objectStore(STORE_QUEUE).delete(clientRequestId));
	} finally {
		db.close();
	}
}

function isUniqueViolation(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /duplicate|unique|23505/i.test(msg);
}

export function isNetworkLikeError(err: unknown): boolean {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
	const msg = err instanceof Error ? err.message : String(err);
	return /failed to fetch|network|offline|load failed|fetch/i.test(msg);
}

/** Flush pending awards to Supabase. Returns remaining count. */
export async function flushPendingAwards(householdId?: string): Promise<{
	flushed: number;
	remaining: number;
	error?: string;
}> {
	const pending = await listPendingAwards(householdId);
	let flushed = 0;
	let error: string | undefined;

	for (const award of pending) {
		try {
			await insertLedgerEntry({
				participant_id: award.participant_id,
				activity_id: award.activity_id,
				points: award.points,
				note: award.note,
				client_request_id: award.client_request_id
			});
			await removePendingAward(award.client_request_id);
			flushed += 1;
		} catch (err) {
			if (isUniqueViolation(err)) {
				await removePendingAward(award.client_request_id);
				flushed += 1;
				continue;
			}
			if (isNetworkLikeError(err)) {
				error = 'Still offline — will retry when you are back online.';
				break;
			}
			error = err instanceof Error ? err.message : String(err);
			break;
		}
	}

	const remaining = (await listPendingAwards(householdId)).length;
	return { flushed, remaining, error };
}

export function newClientRequestId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
