// Returns the first non-empty string among candidates. Used throughout the
// normalizers to defensively probe several possible payload field paths.
export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

export function domainFromEmail(email: string | undefined): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  return email.split("@")[1]?.toLowerCase();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
