export type SignalSource = "reo" | "posthog";

export type SignalType =
  | "product_signup"
  | "ad_signup"
  | "ad_click"
  | "repeat_ad_engagement"
  | "github_star"
  | "key_page_view"
  | "repeat_visit"
  | "generic_page_view"
  | "webinar_registered"
  | "webinar_attended"
  | "linkedin_follow"
  | "dev_activity"; // catch-all for Reo activity types not yet explicitly mapped — see normalizers/reo.ts

export type OriginChannel =
  | "paid_ad"
  | "linkedin"
  | "organic"
  | "webinar"
  | "github"
  | "unknown";

export type RelationshipState =
  | "NET_NEW_CONTACT_NET_NEW_COMPANY"
  | "NEW_CONTACT_KNOWN_COMPANY"
  | "KNOWN_CONTACT_KNOWN_COMPANY";

export type IncomingSignal = {
  source: SignalSource;
  signal_type: SignalType;
  origin_channel: OriginChannel;
  campaign?: string;
  raw_payload: Record<string, unknown>;
  person_identifier: string;
  company_domain?: string;
  occurred_at: string;
  /** Optional, source-specific account/company enrichment a normalizer can
   * attach (e.g. Reo's firmographic data) — persisted onto the companies
   * row by the rollup. industry/employeeCountRange/preferredTechnology/
   * country feed ICP evaluation (src/lib/icp.ts); customerFit/
   * activityScore* are persisted only, not yet wired into scoring. Keeps
   * the core IncomingSignal shape source-agnostic while still letting a
   * source pass through extra data it already has. */
  company_enrichment?: {
    customerFit?: string;
    activityScore?: string;
    activityScoreNumeric?: number;
    industry?: string;
    employeeCountRange?: string;
    preferredTechnology?: string;
    country?: string;
  };
};
