export function humanizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\bjs\b/, "JS")
    .replace(/\bapi\b/, "API")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Display label for a signal: Reo's "Source · Activity" pair when both are
 * present (e.g. "Document · Page visit"), the flat signal_type otherwise
 * (PostHog, or pre-migration Reo rows without a source_type/activity_type
 * pair). */
export function formatSignalLabel(
  signalType: string,
  sourceType?: string | null,
  activityType?: string | null
): string {
  if (sourceType && activityType) {
    return `${humanizeToken(sourceType)} · ${humanizeToken(activityType)}`;
  }
  return signalType.replace(/_/g, " ");
}

export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";

  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = diffMs / (1000 * 60);
  const hours = minutes / 60;
  const days = hours / 24;

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  if (days < 7) return `${Math.round(days)}d ago`;

  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
