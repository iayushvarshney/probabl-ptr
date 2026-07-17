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
 * inspection. Returns null only when no person can be identified at all.
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
  const distinctId = firstString(rawPayload["distinct_id"], person["distinct_id"]);

  const personIdentifier = email ?? distinctId;
  if (!personIdentifier) return null;

  const eventName = firstString(rawPayload["event"], rawPayload["event_name"]) ?? "";
  const signalType = EVENT_SIGNAL_TYPE[eventName] ?? "generic_page_view";

  const campaign = firstString(
    properties["utm_campaign"],
    properties["campaign"],
    rawPayload["campaign"]
  );

  const companyDomain =
    firstString(properties["company_domain"], properties["$host"]) ??
    domainFromEmail(email);

  const occurredAt =
    firstString(rawPayload["timestamp"], rawPayload["sent_at"], properties["$time"]) ??
    new Date().toISOString();

  return {
    source: "posthog",
    signal_type: signalType,
    origin_channel: inferOriginChannel(properties, signalType),
    campaign,
    raw_payload: rawPayload,
    person_identifier: personIdentifier,
    company_domain: companyDomain,
    occurred_at: occurredAt,
  };
}
