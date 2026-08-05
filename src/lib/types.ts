export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night' | 'all_day';

export type Activity = {
	id: string;
	title: string;
	default_points: number;
	allow_negative: boolean;
	/** Expected completion window; default all_day */
	time_of_day: TimeOfDay;
	/** null = applies to every questor */
	assignee_participant_id: string | null;
	household_id: string;
	created_by: string | null;
	created_at: string;
};

export type GrandReward = {
	id: string;
	title: string;
	points_required: number;
	description: string;
	household_id: string;
	created_by: string | null;
	created_at: string;
};

export type Participant = {
	id: string;
	name: string;
	auth_user_id: string | null;
	avatar_color: string;
	household_id: string;
	created_by: string | null;
	created_at: string;
};

export type PointsLedgerEntry = {
	id: string;
	participant_id: string;
	activity_id: string | null;
	grand_reward_id: string | null;
	points: number;
	note: string;
	household_id: string;
	created_by: string | null;
	created_at: string;
	client_request_id?: string | null;
};

export type ExperienceMode = 'kids' | 'goals';

export type Household = {
	id: string;
	name: string;
	invite_code: string;
	allow_negative_points: boolean;
	allow_decimal_points: boolean;
	experience_mode: ExperienceMode;
	/** IANA timezone for local-day reminders */
	timezone: string;
	disabled: boolean;
	created_by: string | null;
	created_at: string;
};

export const DEFAULT_HOUSEHOLD_TIMEZONE = 'America/Chicago';

export const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
	{ value: 'morning', label: 'Morning' },
	{ value: 'afternoon', label: 'Afternoon' },
	{ value: 'evening', label: 'Evening' },
	{ value: 'night', label: 'Night' },
	{ value: 'all_day', label: 'All day' }
];

export type HouseholdSettings = {
	allow_negative_points: boolean;
	allow_decimal_points: boolean;
};

export const DEFAULT_HOUSEHOLD_SETTINGS: HouseholdSettings = {
	allow_negative_points: false,
	allow_decimal_points: false
};

export type HouseholdMember = {
	household_id: string;
	user_id: string;
	role: 'owner' | 'manager';
	joined_at: string;
	display_name: string;
};

export type PlanId = 'free' | 'trial' | 'pro';

export type PlanLimits = {
	max_members: number;
	max_participants: number;
	max_activities: number;
	max_rewards: number;
	plan: PlanId | string;
};

export type HouseholdEntitlement = {
	household_id: string;
	plan: PlanId;
	status: string;
	trial_ends_at: string | null;
	current_period_end: string | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	admin_override: boolean;
	admin_notes: string | null;
	updated_at: string;
	created_at: string;
};

export type AppRole = 'user' | 'admin' | 'super_admin';

export type Profile = {
	id: string;
	display_name: string;
	active_household_id: string | null;
	app_role: AppRole;
	is_test: boolean;
	email_opt_in: boolean;
	push_opt_in: boolean;
	last_active_at: string | null;
	onboarding_completed_at?: string | null;
};

export type FeatureFlag = {
	key: string;
	description: string;
	enabled: boolean;
	rollout: 'off' | 'on' | 'allowlist';
};

export type PlanPrice = {
	id: string;
	country_or_region: string;
	currency: string;
	stripe_price_id: string | null;
	amount_display: string;
	interval: string;
	active: boolean;
};

export type AiLogPreview = {
	participant_id: string;
	activity_id: string;
	points: number;
};

export type ParticipantMeta = Pick<Participant, 'id' | 'name'>;
export type ActivityMeta = Pick<Activity, 'id' | 'title' | 'default_points' | 'allow_negative'>;

export const FREE_LIMITS: PlanLimits = {
	max_members: 1,
	max_participants: 2,
	max_activities: 5,
	max_rewards: 3,
	plan: 'free'
};

export const PRO_LIMITS: PlanLimits = {
	max_members: 3,
	max_participants: 10,
	max_activities: 50,
	max_rewards: 20,
	plan: 'pro'
};
