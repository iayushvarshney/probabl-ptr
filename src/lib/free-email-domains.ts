// Free/personal email providers aren't a reliable proxy for a company
// domain — an email at one of these should never be treated as (or turned
// into) a company. Shared by the normalizers (which must never derive a
// company_domain from one of these) and identity resolution (which must
// never trust one as an explicit domain either).
export const FREE_EMAIL_DOMAINS = new Set([
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

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}
