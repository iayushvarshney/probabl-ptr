import { isFreeEmailDomain } from "@/lib/free-email-domains";
import type { IncomingSignal, OriginChannel, SignalType } from "@/lib/types";
import { asRecord, domainFromEmail, firstString } from "./shared";

// PostHog event name -> our signal_type. Exact event names aren't confirmed
// yet (webhooks aren't registered until build-order step 10) — extend this
// map once real payloads are observed. Unmapped events fall back to
// generic_page_view rather than being dropped.
const EVENT_SIGNAL_TYPE: Record<string, SignalType> = {
  signed_up: "product_signup",
  sign_up: "product_signup",
  user_signed_up: "product_signup",
  product_signup: "product_signup",
  ad_signup: "ad_signup",
  ad_click: "ad_click",
  repeat_ad_engagement: "repeat_ad_engagement",
  github_star: "github_star",
  key_page_view: "key_page_view",
  pricing_page_view: "key_page_view",
  docs_page_view: "key_page_view",
  repeat_visit: "repeat_visit",
  webinar_registered: "webinar_registered",
  webinar_attended: "webinar_attended",
  linkedin_follow: "linkedin_follow",
  page_view: "generic_page_view",
  $pageview: "generic_page_view",
};

function inferOriginChannel(
  properties: Record<string, unknown>,
  signalType: SignalType
): OriginChannel {
  if (signalType === "webinar_registered" || signalType === "webinar_attended") {
    return "webinar";
  }
  if (signalType === "github_star") return "github";

  const utmSource = (firstString(properties["utm_source"]) ?? "").toLowerCase();
  const utmMedium = (firstString(properties["utm_medium"]) ?? "").toLowerCase();

  if (signalType === "linkedin_follow" || utmSource.includes("linkedin")) {
    return "linkedin";
  }
  if (
    utmMedium.includes("paid") ||
    utmMedium.includes("cpc") ||
    ["google", "facebook", "meta", "twitter", "x"].some((s) => utmSource.includes(s))
  ) {
    return "paid_ad";
  }
  if (utmSource || utmMedium) return "organic";
  return "unknown";
}

/**
 * Maps a raw PostHog webhook payload to our IncomingSignal shape. Payload
 * field locations aren't fully confirmed yet, so this probes several
 * plausible paths and always preserves the full raw payload for later
 * inspection.
 *
 * Requires a real, identifiable email — anonymous events (no email; only
 * PostHog's own generated distinct_id) are dropped rather than turned into
 * a signal. Without this, every anonymous $pageview/autocapture event from
 * the site's own traffic would still need *some* person_identifier and
 * company_domain, and the only thing available for those is PostHog's
 * `$host` property — which is the hostname of the page the visitor was on,
 * not their company. That produced entities like "blog.probabl.ai" as if
 * it were a prospect account. Requiring an email avoids that entirely: it's
 * the one signal that's actually about a real, identifiable person.
 */
export function normalizePostHogSignal(
  rawPayload: Record<string, unknown>
): IncomingSignal | null {
  const properties = asRecord(rawPayload["properties"]);
  const person = asRecord(rawPayload["person"]);
  const personProperties = asRecord(person["properties"]);

  const email = firstString(
    properties["email"],
    person["email"],
    personProperties["email"],
    rawPayload["email"]
  );
  if (!email) return null;

  const eventName = firstString(rawPayload["event"], rawPayload["event_name"]) ?? "";
  const signalType = EVENT_SIGNAL_TYPE[eventName] ?? "generic_page_view";

  const campaign = firstString(
    properties["utm_campaign"],
    properties["campaign"],
    rawPayload["campaign"]
  );

  // Only an explicit company_domain property counts — $host (the page's
  // own hostname) is never a valid proxy for the visitor's company. The
  // email-derived fallback is skipped for free/personal providers (gmail,
  // yahoo, etc.) — deriving "gmail.com" as a company_domain doesn't just
  // mislabel one entity, it wrongly merges every unrelated gmail user into
  // the same fake company (upsertCompany matches on domain).
  const emailDomain = domainFromEmail(email);
  const companyDomain =
    firstString(properties["company_domain"]) ??
    (emailDomain && !isFreeEmailDomain(emailDomain) ? emailDomain : undefined);

  const occurredAt =
    firstString(rawPayload["timestamp"], rawPayload["sent_at"], properties["$time"]) ??
    new Date().toISOString();

  return {
    source: "posthog",
    signal_type: signalType,
    origin_channel: inferOriginChannel(properties, signalType),
    campaign,
    raw_payload: rawPayload,
    person_identifier: email,
    company_domain: companyDomain,
    occurred_at: occurredAt,
  };
}
