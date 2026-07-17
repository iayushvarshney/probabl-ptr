import type { IncomingSignal, OriginChannel, SignalType } from "@/lib/types";
import { asRecord, firstString } from "./shared";

// Confirmed against a real Reo Activity webhook payload: PAGE_VISIT. The
// rest are educated guesses at Reo's naming convention pending more real
// payloads — an unmapped activity_type is never dropped, it falls through
// to "dev_activity" and gets logged so this table can be extended.
const ACTIVITY_TYPE_MAP: Record<string, SignalType> = {
  GITHUB_STAR: "github_star",
  REPO_STAR: "github_star",
  STARRED_REPO: "github_star",
  PACKAGE_INSTALL: "dev_activity",
  PACKAGE_DOWNLOAD: "dev_activity",
  NPM_INSTALL: "dev_activity",
  PIP_INSTALL: "dev_activity",
  DOCS_VISIT: "key_page_view",
  WEBINAR_REGISTERED: "webinar_registered",
  WEBINAR_ATTENDED: "webinar_attended",
  LINKEDIN_FOLLOW: "linkedin_follow",
};

// Substrings in activity_source_url that mark a PAGE_VISIT as "key" rather
// than generic. Hardcoded heuristic, easy to extend.
const KEY_PAGE_URL_PATTERNS = [
  "pricing",
  "docs",
  "documentation",
  "demo",
  "contact",
  "signup",
  "sign-up",
  "get-started",
];

function isKeyPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return KEY_PAGE_URL_PATTERNS.some((pattern) => lower.includes(pattern));
}

function mapActivityType(activityType: string, sourceUrl: string | undefined): SignalType {
  const normalized = activityType.toUpperCase();

  if (normalized === "PAGE_VISIT") {
    return isKeyPageUrl(sourceUrl) ? "key_page_view" : "generic_page_view";
  }

  const mapped = ACTIVITY_TYPE_MAP[normalized];
  if (mapped) return mapped;

  console.warn(
    `[reo normalizer] unmapped activity_type "${activityType}" — storing as dev_activity`
  );
  return "dev_activity";
}

function inferOriginChannel(sourceType: string | undefined, signalType: SignalType): OriginChannel {
  const normalized = (sourceType ?? "").toUpperCase();

  if (normalized === "WEBSITE") return "organic";
  if (normalized === "GITHUB") return "github";
  if (normalized === "LINKEDIN") return "linkedin";
  if (normalized === "WEBINAR") return "webinar";

  // source_type didn't say enough — fall back on what the signal itself
  // implies. GitHub-sourced activity defaults to the github channel even
  // when source_type is missing or unrecognized.
  if (signalType === "github_star" || signalType === "dev_activity") return "github";
  if (signalType === "linkedin_follow") return "linkedin";
  if (signalType === "webinar_registered" || signalType === "webinar_attended") return "webinar";

  return "unknown";
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
 */
export function normalizeReoSignal(rawPayload: Record<string, unknown>): IncomingSignal | null {
  const developer = asRecord(rawPayload["developer"]);
  const account = asRecord(developer["account"]);

  const accountName = firstString(account["account_name"]);
  const personIdentifier = resolvePersonIdentifier(developer, accountName);
  if (!personIdentifier) return null;

  const activityType = firstString(rawPayload["activity_type"]) ?? "";
  const sourceUrl = firstString(rawPayload["activity_source_url"]);
  const signalType = mapActivityType(activityType, sourceUrl);

  const sourceType = firstString(rawPayload["source_type"]);
  const originChannel = inferOriginChannel(sourceType, signalType);

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
    signal_type: signalType,
    origin_channel: originChannel,
    raw_payload: rawPayload,
    person_identifier: personIdentifier,
    company_domain: companyDomain,
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
