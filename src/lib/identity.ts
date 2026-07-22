import { isFreeEmailDomain } from "@/lib/free-email-domains";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const explicitDomainRaw = signal.company_domain?.trim().toLowerCase() || undefined;
  const explicitDomain =
    explicitDomainRaw && !isFreeEmailDomain(explicitDomainRaw) ? explicitDomainRaw : undefined;
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
