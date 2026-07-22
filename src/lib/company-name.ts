// Last-resort company name when no real name is available from HubSpot or
// the source payload (Reo's account_name, PostHog's company field): derive
// a readable label from the domain rather than showing it raw. Best-effort
// only — not a full public-suffix-list implementation.

const COMMON_SUBDOMAINS = new Set(["www", "mail", "studenti", "app", "portal", "my", "web"]);

// Common two-part TLDs — without this, e.g. "example.co.uk" would strip
// only ".uk" and produce "Co" instead of "Example".
const SECOND_LEVEL_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "co.in",
  "co.nz",
  "co.jp",
  "com.br",
]);

export function cleanDomainToName(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  let relevant = parts;

  // Strip a recognized leading subdomain, e.g. studenti.uniba.it -> uniba.it
  if (relevant.length > 2 && COMMON_SUBDOMAINS.has(relevant[0])) {
    relevant = relevant.slice(1);
  }

  // Strip the TLD, including two-part ones like .co.uk.
  const lastTwo = relevant.slice(-2).join(".");
  const label = SECOND_LEVEL_TLDS.has(lastTwo)
    ? (relevant.at(-3) ?? relevant[0])
    : relevant.length > 1
      ? relevant.at(-2)!
      : relevant[0];

  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
