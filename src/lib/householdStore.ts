/** Shared active household id for the signed-in manager. */
let activeHouseholdId: string | null = null;

export function getActiveHouseholdId(): string | null {
	return activeHouseholdId;
}

export function setActiveHouseholdId(id: string | null) {
	activeHouseholdId = id;
}

export async function requireHouseholdId(
	ensure: () => Promise<string>
): Promise<string> {
	if (activeHouseholdId) return activeHouseholdId;
	const id = await ensure();
	activeHouseholdId = id;
	return id;
}
