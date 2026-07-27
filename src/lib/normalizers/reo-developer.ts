import { asRecord, firstString } from "./shared";

export type ReoDeveloperMembership = {
  company: {
    domain?: string;
    name?: string;
    customerFit?: string;
    activityScore?: string;
    activityScoreNumeric?: number;
    industry?: string;
    employeeCountRange?: string;
    preferredTechnology?: string;
    developerFunnel?: string;
  };
  contact: {
    email?: string;
    fullName?: string;
    linkedinUrl?: string;
    title?: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// developer_business_email only becomes contacts.email when it actually
// looks like one — never a GitHub URL or a bare name, since that column is
// also the dedupe key onConflict("email") in upsertContact, and a fake
// "email" there would fork a second contact row the next time a real email
// shows up for the same person.
function resolveContactEmail(rawPayload: Record<string, unknown>): string | undefined {
  const email = firstString(rawPayload["developer_business_email"]);
  if (!email) return undefined;
  if (EMAIL_RE.test(email)) return email.toLowerCase();

  console.warn(
    `[reo developer normalizer] developer_business_email "${email}" doesn't look like a real email — ignoring`
  );
  return undefined;
}

// full_name cascade: developer_name -> first+last -> GitHub URL. When email
// is also missing, upsertContact falls back to deduping by full_name scoped
// to the company, so this is the identifier of last resort for that path.
function resolveContactFullName(rawPayload: Record<string, unknown>): string | undefined {
  const name = firstString(rawPayload["developer_name"]);
  if (name) return name;

  const first = firstString(rawPayload["developer_first_name"]);
  const last = firstString(rawPayload["developer_last_name"]);
  if (first || last) return [first, last].filter(Boolean).join(" ");

  const github = firstString(rawPayload["developer_github"]);
  if (github) {
    console.warn(
      "[reo developer normalizer] missing developer_name — falling back to GitHub URL as the contact's display name"
    );
    return github;
  }

  return undefined;
}

/**
 * Maps a real Reo.dev "Developer" webhook payload — a developer-added-to-
 * segment MEMBERSHIP event, not a timestamped activity (no activity_type /
 * activity_date / activity_source_url) — into company + contact fields for
 * a quiet background upsert (see src/lib/rollup.ts's upsertCompany /
 * upsertContact). Deliberately NOT an IncomingSignal: this must never be
 * scored or create an entity/queue row. Returns null only when neither a
 * company nor a person can be identified at all.
 */
export function normalizeReoDeveloperMembership(
  rawPayload: Record<string, unknown>
): ReoDeveloperMembership | null {
  const account = asRecord(rawPayload["account"]);

  const domain = firstString(account["account_domain"]);
  const name = firstString(account["account_name"]);
  if (!domain && !name) {
    console.warn(
      "[reo developer normalizer] no account_domain/account_name — cannot resolve a company, dropping payload"
    );
    return null;
  }

  const email = resolveContactEmail(rawPayload);
  const fullName = resolveContactFullName(rawPayload);
  if (!email && !fullName) {
    console.warn("[reo developer normalizer] no identifiable person on payload — dropping");
    return null;
  }

  const activityScoreNumericRaw = account["activity_score_numeric"];
  const activityScoreNumeric =
    typeof activityScoreNumericRaw === "number" ? activityScoreNumericRaw : undefined;

  return {
    company: {
      domain,
      name,
      customerFit: firstString(account["customer_fit"]),
      activityScore: firstString(account["activity_score"]),
      activityScoreNumeric,
      industry: firstString(account["industry"]),
      employeeCountRange: firstString(account["employee_count_range"]),
      preferredTechnology: firstString(account["preferred_technology"]),
      developerFunnel: firstString(account["developer_funnel"]),
    },
    contact: {
      email,
      fullName,
      linkedinUrl: firstString(rawPayload["developer_linkedin"]),
      title: firstString(rawPayload["developer_designation"]),
    },
  };
}
