import type { IncomingSignal } from "@/lib/types";

export type IdentityConfidence = "high" | "medium" | "low";

export type ResolvedPerson = {
  email?: string;
  full_name?: string;
};

export type ResolvedCompany = {
  domain?: string;
  name?: string;
};

export type IdentityResolution = {
  person: ResolvedPerson;
  company: ResolvedCompany;
  confidence: IdentityConfidence;
};

// Free/personal email providers aren't a reliable proxy for a company
// domain — an email at one of these shouldn't be treated as a confident
// company match on its own.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "yandex.com",
  "mail.com",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Resolves a signal's person_identifier/company_domain into a structured
 * identity with a confidence score. Pure parse — no DB or HubSpot lookups
 * here (those happen downstream in the rollup). Cascade per CLAUDE.md:
 * email -> company_domain -> fuzzy name+company.
 */
export function resolveIdentity(signal: IncomingSignal): IdentityResolution {
  const identifier = signal.person_identifier.trim();

  let email: string | undefined;
  let fullName: string | undefined;
  let companyNameFromIdentifier: string | undefined;

  if (EMAIL_RE.test(identifier)) {
    email = identifier.toLowerCase();
  } else if (identifier.includes(" @ ")) {
    // our normalizers fall back to "Name @ Company" when no email is present
    const [namePart, companyPart] = identifier.split(" @ ");
    fullName = namePart.trim() || undefined;
    companyNameFromIdentifier = companyPart.trim() || undefined;
  } else {
    fullName = identifier || undefined;
  }

  const explicitDomain = signal.company_domain?.trim().toLowerCase() || undefined;
  const emailDomain = email?.split("@")[1];
  const domain =
    explicitDomain ??
    (emailDomain && !isFreeEmailDomain(emailDomain) ? emailDomain : undefined);

  const hasReliableEmail = !!email;
  const hasReliableDomain = !!domain;

  let confidence: IdentityConfidence;
  if (hasReliableEmail && hasReliableDomain) confidence = "high";
  else if (hasReliableEmail || hasReliableDomain) confidence = "medium";
  else confidence = "low";

  return {
    person: { email, full_name: fullName },
    company: { domain, name: companyNameFromIdentifier },
    confidence,
  };
}
