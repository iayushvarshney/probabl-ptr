/** True for PostgREST/Postgres "column doesn't exist" errors — used to
 * gracefully degrade when an optional migration hasn't been run yet. */
export function isMissingColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  // 42703 is Postgres's raw "undefined column"; PGRST204 is PostgREST's own
  // "column not found in schema cache" (what we actually see in practice),
  // e.g. "Could not find the 'foo' column of 'bar' in the schema cache".
  if (err?.code === "42703" || err?.code === "PGRST204") return true;
  const message = err?.message ?? "";
  return message.includes("does not exist") || /Could not find the '.*' column/.test(message);
}

/** True for Postgres/PostgREST "relation/table doesn't exist" errors. */
export function isMissingTableError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  // 42P01 is Postgres's raw "undefined table"; PGRST205 is PostgREST's own
  // "table not found in schema cache" (what we actually see in practice),
  // e.g. "Could not find the table 'public.settings' in the schema cache".
  if (err?.code === "42P01" || err?.code === "PGRST205") return true;
  const message = err?.message ?? "";
  return /Could not find the table/.test(message);
}
