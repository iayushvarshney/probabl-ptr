import type { RelationshipState, SignalType } from "@/lib/types";

// composite_score = relationship_weight * signal_intensity_sum * target_multiplier
// Every weight/decay/multiplier used by the scoring model lives here — the
// scoring function itself must not hardcode any number.

export const SIGNAL_TYPE_WEIGHTS: Record<SignalType, number> = {
  product_signup: 40,
  ad_signup: 40,
  webinar_attended: 30,
  github_star: 25,
  repeat_ad_engagement: 20,
  key_page_view: 15,
  webinar_registered: 15,
  ad_click: 12,
  repeat_visit: 10,
  linkedin_follow: 8,
  generic_page_view: 5,
  // Catch-all for Reo activity types not yet explicitly mapped (see
  // src/lib/normalizers/reo.ts) — modest weight until real-world volume
  // tells us how meaningful these actually are.
  dev_activity: 10,
};

// Recency decay applied to each signal's weight, keyed by days since it
// occurred. Evaluated in order; the first tier whose maxDays is met wins.
export const RECENCY_DECAY_TIERS: Array<{ maxDays: number; multiplier: number }> = [
  { maxDays: 7, multiplier: 1.0 },
  { maxDays: 30, multiplier: 0.5 },
  { maxDays: Infinity, multiplier: 0.2 },
];

export const RELATIONSHIP_WEIGHTS: Record<RelationshipState, number> = {
  NEW_CONTACT_KNOWN_COMPANY: 3.0,
  KNOWN_CONTACT_KNOWN_COMPANY: 2.0,
  NET_NEW_CONTACT_NET_NEW_COMPANY: 1.0,
};

// Applies only on top of the NET_NEW_* relationship_weight, when the
// company matches the (currently hardcoded) ICP check.
export const NET_NEW_ICP_BONUS_MULTIPLIER = 1.5;

// Applies to the whole composite score when the company is a target account.
export const TARGET_ACCOUNT_MULTIPLIER = 1.5;
export const NON_TARGET_ACCOUNT_MULTIPLIER = 1.0;

// Bundled shape for the settings page / settings table. The scoring
// function (src/lib/scoring.ts) takes this as a parameter — it never
// imports the constants above directly — so it can be swapped out for
// live values from the settings table, with these constants as the
// fallback/seed.
export type ScoringWeights = {
  signalTypeWeights: Record<SignalType, number>;
  recencyDecayTiers: Array<{ maxDays: number; multiplier: number }>;
  relationshipWeights: Record<RelationshipState, number>;
  netNewIcpBonusMultiplier: number;
  targetAccountMultiplier: number;
  nonTargetAccountMultiplier: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  signalTypeWeights: SIGNAL_TYPE_WEIGHTS,
  recencyDecayTiers: RECENCY_DECAY_TIERS,
  relationshipWeights: RELATIONSHIP_WEIGHTS,
  netNewIcpBonusMultiplier: NET_NEW_ICP_BONUS_MULTIPLIER,
  targetAccountMultiplier: TARGET_ACCOUNT_MULTIPLIER,
  nonTargetAccountMultiplier: NON_TARGET_ACCOUNT_MULTIPLIER,
};
