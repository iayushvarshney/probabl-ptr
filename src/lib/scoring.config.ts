import type { RelationshipState, SignalType } from "@/lib/types";

// composite_score = relationship_weight * signal_intensity_sum * target_multiplier
// Every weight/decay/multiplier used by the scoring model lives here — the
// scoring function itself must not hardcode any number.

// Reo's real taxonomy: the SAME activity_type means different things under
// different source_types (a PAGE_VISIT under DOCUMENT is high-intent "docs
// review"; a PAGE_VISIT under WEBSITE is a generic view), so Reo signals are
// weighted on the (source_type, activity_type) pair below — never on
// activity_type alone. This is separate from SIGNAL_TYPE_WEIGHTS, which
// still drives PostHog's flat signal types (and any pre-migration Reo rows
// that couldn't be backfilled with a source_type/activity_type pair).
export type ReoSourceType =
  | "GITHUB"
  | "DOCUMENT"
  | "WEBSITE"
  | "PRODUCT_JS"
  | "CODE_INTERACTIONS"
  | "SLACK"
  | "LINKEDIN"
  | "PRODUCT_API";

// GITHUB/DOCUMENT/WEBSITE/PRODUCT_JS are wired up via Reo today; the rest
// (CODE_INTERACTIONS/SLACK/LINKEDIN/PRODUCT_API) aren't sending data yet —
// see the "not active yet" labels in the Settings UI — but their weights are
// seeded and ready for when they are.
export const REO_ACTIVITY_WEIGHTS: Record<ReoSourceType, Record<string, number>> = {
  GITHUB: {
    FORK: 30,
    PULL_REQUEST: 28,
    ISSUE_CREATION: 25,
    COMMENT: 18,
    STAR: 12,
    WATCH: 8,
  },
  DOCUMENT: {
    PAGE_VISIT: 45,
    FORM_CAPTURE: 40,
    COPY_COMMAND: 35,
    COPY_PACKAGE_MANAGER: 35,
    COPY_TEXT: 20,
  },
  WEBSITE: {
    PAGE_VISIT: 15,
    FORM_CAPTURE: 40,
    COPY_COMMAND: 25,
    COPY_PACKAGE_MANAGER: 25,
    COPY_TEXT: 10,
  },
  PRODUCT_JS: {
    IDENTITY: 40,
    COPY_COMMAND: 30,
    COPY_PACKAGE_MANAGER: 30,
    PAGE_VISIT: 20,
    COPY_TEXT: 15,
  },
  CODE_INTERACTIONS: {
    INTERACTION_COPY_COMMAND: 40,
    INTERACTION_COPY_PACKAGE_MANAGER: 40,
  },
  PRODUCT_API: {
    USAGE_METRIC: 30,
  },
  SLACK: {
    SLACK_MESSAGE: 20,
    SLACK_JOINED: 12,
    SLACK_REPLY: 15,
    SLACK_REACTION: 5,
  },
  LINKEDIN: {
    LINKEDIN_MESSAGE: 15,
    LINKEDIN_REPLY: 12,
    LINKEDIN_REACTION: 5,
  },
};

// Weight applied to a Reo (source_type, activity_type) pair that isn't in
// REO_ACTIVITY_WEIGHTS — logged as unmapped by the normalizer, but never
// dropped. Matches the old flat "dev_activity" catch-all weight.
export const REO_DEFAULT_ACTIVITY_WEIGHT = 10;

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
  reoActivityWeights: Record<ReoSourceType, Record<string, number>>;
  reoDefaultActivityWeight: number;
  recencyDecayTiers: Array<{ maxDays: number; multiplier: number }>;
  relationshipWeights: Record<RelationshipState, number>;
  netNewIcpBonusMultiplier: number;
  targetAccountMultiplier: number;
  nonTargetAccountMultiplier: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  signalTypeWeights: SIGNAL_TYPE_WEIGHTS,
  reoActivityWeights: REO_ACTIVITY_WEIGHTS,
  reoDefaultActivityWeight: REO_DEFAULT_ACTIVITY_WEIGHT,
  recencyDecayTiers: RECENCY_DECAY_TIERS,
  relationshipWeights: RELATIONSHIP_WEIGHTS,
  netNewIcpBonusMultiplier: NET_NEW_ICP_BONUS_MULTIPLIER,
  targetAccountMultiplier: TARGET_ACCOUNT_MULTIPLIER,
  nonTargetAccountMultiplier: NON_TARGET_ACCOUNT_MULTIPLIER,
};
