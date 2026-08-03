import { supabase } from './supabase';
import type { Profile } from './types';
import { copyFor, navLabels } from './experience';
import type { ExperienceMode } from './types';

export const ONBOARDING_STORAGE_KEY = 'hh_onboarding_v1';

export type TourStep = {
	id: string;
	title: string;
	body: string;
	/** Navigate here before highlighting */
	route?: string;
	/** data-tour attribute value */
	target?: string;
};

export function getTourSteps(mode: ExperienceMode = 'kids'): TourStep[] {
	const labels = navLabels(mode);
	const questor = copyFor(mode, 'participant');
	const questors = copyFor(mode, 'participants');
	const quests = copyFor(mode, 'activities');
	const bounties = copyFor(mode, 'rewards');

	return [
		{
			id: 'welcome',
			title: 'Welcome to Hero Habits',
			body: 'A quick tour of your guild toolkit. You will see where to add people, create quests, set bounties, and track XP.'
		},
		{
			id: 'questors-nav',
			title: `Start with ${questors}`,
			body: `${questors} are the people you track — kids, teammates, or yourself. Open this tab to add them.`,
			route: '/dashboard',
			target: 'nav-participants'
		},
		{
			id: 'questors-add',
			title: `Add a ${questor}`,
			body: `Tap the + button to add your first ${questor.toLowerCase()}. Give them a name and color — you can add more anytime.`,
			route: '/participants',
			target: 'add-participant'
		},
		{
			id: 'quests',
			title: quests,
			body: `${quests} are the things that earn XP — chores, habits, or goals. Create them here, then log completions from the Quest Log.`,
			route: '/participants',
			target: 'nav-activities'
		},
		{
			id: 'bounties',
			title: bounties,
			body: `${bounties} are rewards or goals unlocked with XP. Set the XP cost, then claim them when a ${questor.toLowerCase()} has enough.`,
			route: '/activities',
			target: 'nav-rewards'
		},
		{
			id: 'quest-log',
			title: labels.dashboard,
			body: 'Your home base. See standings, log XP, and watch progress toward bounties.',
			route: '/rewards',
			target: 'nav-dashboard'
		},
		{
			id: 'guild',
			title: labels.share,
			body: 'Invite a guild mate to help manage the same questors, quests, and bounties. Share the invite link from here.',
			route: '/dashboard',
			target: 'nav-share'
		},
		{
			id: 'done',
			title: 'You are ready',
			body: `Add ${questors.toLowerCase()} first, then ${quests.toLowerCase()} and ${bounties.toLowerCase()}. Replay this guide anytime from Guild Stats.`
		}
	];
}

export function isOnboardingDoneLocal(): boolean {
	if (typeof localStorage === 'undefined') return true;
	return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
}

export function markOnboardingDoneLocal(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
}

export function clearOnboardingDoneLocal(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}

export function shouldStartOnboarding(profile: Profile | null): boolean {
	if (typeof localStorage === 'undefined') return false;
	if (sessionStorage.getItem('hh_onboarding_force') === '1') return true;
	if (isOnboardingDoneLocal()) return false;
	if (profile?.onboarding_completed_at) return false;
	return true;
}

export async function completeOnboarding(): Promise<void> {
	markOnboardingDoneLocal();
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.removeItem('hh_onboarding_force');
	}
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return;
	const { error } = await supabase
		.from('profiles')
		.update({ onboarding_completed_at: new Date().toISOString() })
		.eq('id', user.id);
	if (error) {
		console.warn('Could not persist onboarding completion', error.message);
	}
}

export async function resetOnboarding(): Promise<void> {
	clearOnboardingDoneLocal();
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.setItem('hh_onboarding_force', '1');
	}
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return;
	const { error } = await supabase
		.from('profiles')
		.update({ onboarding_completed_at: null })
		.eq('id', user.id);
	if (error) {
		console.warn('Could not reset onboarding flag', error.message);
	}
}

export function findTourTarget(id: string): HTMLElement | null {
	const nodes = [...document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)];
	return (
		nodes.find((el) => {
			const style = getComputedStyle(el);
			const rect = el.getBoundingClientRect();
			return (
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				style.opacity !== '0' &&
				rect.width > 0 &&
				rect.height > 0
			);
		}) ?? null
	);
}
