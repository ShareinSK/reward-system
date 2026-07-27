export type Activity = {
	id: string;
	title: string;
	default_points: number;
	allow_negative: boolean;
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
};

export type Household = {
	id: string;
	name: string;
	invite_code: string;
	allow_negative_points: boolean;
	allow_decimal_points: boolean;
	created_by: string | null;
	created_at: string;
};

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

export type AiLogPreview = {
	participant_id: string;
	activity_id: string;
	points: number;
};

export type ParticipantMeta = Pick<Participant, 'id' | 'name'>;
export type ActivityMeta = Pick<Activity, 'id' | 'title' | 'default_points' | 'allow_negative'>;
