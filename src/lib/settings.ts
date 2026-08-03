import type { HouseholdSettings } from './types';
import { DEFAULT_HOUSEHOLD_SETTINGS } from './types';

export function settingsFromHousehold(
	household: Partial<HouseholdSettings> | null | undefined
): HouseholdSettings {
	return {
		allow_negative_points: household?.allow_negative_points ?? DEFAULT_HOUSEHOLD_SETTINGS.allow_negative_points,
		allow_decimal_points: household?.allow_decimal_points ?? DEFAULT_HOUSEHOLD_SETTINGS.allow_decimal_points
	};
}

/** Format points for display based on household preference. */
export function formatPoints(value: number, allowDecimals: boolean, opts?: { signed?: boolean }): string {
	const n = Number(value);
	const abs = allowDecimals ? n.toFixed(1) : Math.round(n).toString();
	if (opts?.signed && n > 0) return `+${abs}`;
	return abs;
}

/** Normalize an entered amount to household rules before saving. */
export function normalizePoints(value: number, settings: HouseholdSettings): number {
	let n = Number(value);
	if (Number.isNaN(n)) return NaN;
	if (!settings.allow_decimal_points) n = Math.round(n);
	else n = Math.round(n * 10) / 10;
	if (!settings.allow_negative_points && n < 0) return NaN;
	return n;
}

export function pointsStep(allowDecimals: boolean): string {
	return allowDecimals ? '0.1' : '1';
}

export function pointsInputHint(settings: HouseholdSettings): string | null {
	if (!settings.allow_decimal_points && !settings.allow_negative_points) {
		return 'Whole numbers only. Negative points are turned off in Settings.';
	}
	if (!settings.allow_decimal_points) {
		return 'Whole numbers only. Change this in Settings.';
	}
	if (!settings.allow_negative_points) {
		return 'Negative points are turned off in Settings.';
	}
	return null;
}
