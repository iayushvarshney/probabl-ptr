import { REO_ACTIVITY_WEIGHTS, type ReoSourceType } from "@/lib/scoring.config";
import type { IncomingSignal, OriginChannel } from "@/lib/types";
import { asRecord, firstString } from "./shared";

// Reo's real taxonomy keys on the (source_type, activity_type) PAIR, not
// activity_type alone — the same activity_type means different things under
// different source_types (a PAGE_VISIT under DOCUMENT is high-intent "docs
// review"; a PAGE_VISIT under WEBSITE is a generic view). Both fields are
// preserved verbatim from the payload rather than collapsed into a flat
// generic signal_type. REO_ACTIVITY_WEIGHTS (scoring.config.ts) is the
// single source of truth for which pairs are "known" — checked here only to
// decide whether to log an "unmapped" warning; the pair is stored either
// way and scoring falls back to a small default weight for unmapped pairs.
function isKnownReoPair(sourceType: string, activityType: string): boolean {
  const knownActivities = REO_ACTIVITY_WEIGHTS[sourceType as ReoSourceType];
  return knownActivities !== undefined && knownActivities[activityType] !== undefined;
}

function inferOriginChannel(sourceType: string): OriginChannel {
  switch (sourceType) {
    case "GITHUB":
      return "github";
    case "LINKEDIN":
      return "linkedin";
    case "WEBSITE":
    case "DOCUMENT":
      return "organic";
    // SLACK/PRODUCT_JS/PRODUCT_API/CODE_INTERACTIONS don't map onto our
    // fixed OriginChannel set (paid_ad/linkedin/organic/webinar/github) —
    // "unknown" is the honest answer, not a guess.
    default:
      return "unknown";
  }
}

// Reo sends "YYYY-MM-DD HH:MM:SS" — not ISO8601, no timezone, and the
// year field can be garbage (Reo's own sample payload has year 56087).
// Parsed as UTC; recency scoring only cares about elapsed days, not
// time-of-day precision.
const REO_DATE_RE = /^(\d{1,6})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

function parseReoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = REO_DATE_RE.exec(value.trim());
  if (!match) return null;

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);

  const currentYear = new Date().getUTCFullYear();
  if (year < 1990 || year > currentYear + 1) return null; // implausible

  const date = new Date(
    Date.UTC(
      year,
      Number(monthStr) - 1,
      Number(dayStr),
      Number(hourStr),
      Number(minuteStr),
      Number(secondStr)
    )
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveOccurredAt(activityDate: string | undefined): string {
  const parsed = parseReoDate(activityDate);
  if (parsed) return parsed.toISOString();

  console.warn(
    `[reo normalizer] unparseable or implausible activity_date "${activityDate}" — using current time instead`
  );
  return new Date().toISOString();
}

/**
 * person_identifier cascade: business email (best) -> GitHub URL -> plain
 * name. Falling back away from email naturally lowers resolveIdentity()'s
 * confidence downstream, since only a real email counts as a "reliable"
 * person match there.
 */
function resolvePersonIdentifier(
  developer: Record<string, unknown>,
  accountName: string | undefined
): string | null {
  const email = firstString(developer["developer_business_email"]);
  if (email) return email;

  const github = firstString(developer["developer_github"]);
  if (github) {
    console.warn(
      "[reo normalizer] missing developer_business_email — falling back to GitHub URL as person_identifier"
    );
    return github;
  }

  const name = firstString(developer["developer_name"]);
  if (name) {
    console.warn(
      "[reo normalizer] missing developer_business_email and developer_github — falling back to name"
    );
    return accountName ? `${name} @ ${accountName}` : name;
  }

  return null;
}

/**
 * Maps a real Reo.dev "Activity" webhook payload to our IncomingSignal
 * shape. Every nested field is probed defensively — a missing field
 * degrades gracefully (null, or a less-confident person_identifier) rather
 * than throwing. Returns null only when no person can be identified at all.
 *
 * source_type/activity_type are preserved verbatim (uppercased) rather than
 * collapsed into a flat generic signal_type — see isKnownReoPair above.
 * signal_type itself becomes a generic "dev_activity" catch-all for every
 * Reo activity signal; the real classification scoring keys on lives in
 * source_type/activity_type.
 */
export function normalizeReoSignal(rawPayload: Record<string, unknown>): IncomingSignal | null {
  const developer = asRecord(rawPayload["developer"]);
  const account = asRecord(developer["account"]);

  const accountName = firstString(account["account_name"]);
  const personIdentifier = resolvePersonIdentifier(developer, accountName);
  if (!personIdentifier) return null;

  const sourceType = (firstString(rawPayload["source_type"]) ?? "UNKNOWN_SOURCE").toUpperCase();
  const activityType = (firstString(rawPayload["activity_type"]) ?? "UNKNOWN_ACTIVITY").toUpperCase();

  if (!isKnownReoPair(sourceType, activityType)) {
    console.warn(
      `[reo normalizer] unmapped (source_type, activity_type) pair "${sourceType}/${activityType}" ` +
        "— storing verbatim, scored at the default weight"
    );
  }

  const originChannel = inferOriginChannel(sourceType);

  const companyDomain = firstString(account["account_domain"]);
  const occurredAt = resolveOccurredAt(firstString(rawPayload["activity_date"]));

  // Account-level firmographic/fit enrichment — persisted onto the company
  // row by the rollup. industry/employeeCountRange/preferredTechnology/
  // country feed ICP evaluation (src/lib/icp.ts); customerFit/
  // activityScore* are persisted only, not yet wired into scoring.
  const customerFit = firstString(account["customer_fit"]);
  const activityScore = firstString(account["activity_score"]);
  const activityScoreNumericRaw = account["activity_score_numeric"];
  const activityScoreNumeric =
    typeof activityScoreNumericRaw === "number" ? activityScoreNumericRaw : undefined;
  const industry = firstString(account["industry"]);
  const employeeCountRange = firstString(account["employee_count_range"]);
  const preferredTechnology = firstString(account["preferred_technology"]);
  const country = firstString(account["country"]);

  const hasEnrichment =
    customerFit !== undefined ||
    activityScore !== undefined ||
    activityScoreNumeric !== undefined ||
    industry !== undefined ||
    employeeCountRange !== undefined ||
    preferredTechnology !== undefined ||
    country !== undefined;

  return {
    source: "reo",
    signal_type: "dev_activity",
    source_type: sourceType,
    activity_type: activityType,
    origin_channel: originChannel,
    raw_payload: rawPayload,
    person_identifier: personIdentifier,
    company_domain: companyDomain,
    company_name: accountName,
    occurred_at: occurredAt,
    ...(hasEnrichment
      ? {
          company_enrichment: {
            customerFit,
            activityScore,
            activityScoreNumeric,
            industry,
            country,
            employeeCountRange,
            preferredTechnology,
          },
        }
      : {}),
  };
}
