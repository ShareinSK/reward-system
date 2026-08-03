import type { ExperienceMode } from './types';

/**
 * RPG display copy. Keys map to product concepts; DB/API names stay unchanged.
 * Mode still switches kids vs goals theme, but terminology is unified.
 */
export type CopyKeys =
	| 'participants'
	| 'participant'
	| 'activities'
	| 'activity'
	| 'rewards'
	| 'reward'
	| 'points'
	| 'point'
	| 'guild'
	| 'questLog'
	| 'tagline';

/** Unified RPG labels for both experience modes. */
const rpgCopy: Record<CopyKeys, string> = {
	participants: 'Questors',
	participant: 'Questor',
	activities: 'Quests',
	activity: 'Quest',
	rewards: 'Bounties',
	reward: 'Bounty',
	points: 'XP',
	point: 'XP',
	guild: 'Guild',
	questLog: 'Quest Log',
	tagline: 'Complete quests, earn XP, and claim bounties with your guild.'
};

export function copyFor(_mode: ExperienceMode, key: CopyKeys): string {
	return rpgCopy[key];
}

export function navLabels(_mode: ExperienceMode) {
	return {
		dashboard: 'Quest Log',
		participants: 'Questors',
		activities: 'Quests',
		rewards: 'Bounties',
		share: 'Guild',
		settings: 'Guild Stats',
		billing: 'Billing',
		guildStats: 'Guild Stats'
	};
}
