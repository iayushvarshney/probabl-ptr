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
