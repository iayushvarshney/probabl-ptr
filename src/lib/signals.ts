import { isMissingColumnError } from "@/lib/db-errors";
import { supabase } from "@/lib/supabase";
import type { IncomingSignal } from "@/lib/types";

export async function insertSignal(signal: IncomingSignal) {
  const row = {
    source: signal.source,
    signal_type: signal.signal_type,
    source_type: signal.source_type ?? null,
    activity_type: signal.activity_type ?? null,
    origin_channel: signal.origin_channel,
    campaign: signal.campaign ?? null,
    raw_payload: signal.raw_payload,
    person_identifier: signal.person_identifier,
    company_domain: signal.company_domain ?? null,
    occurred_at: signal.occurred_at,
  };

  let { data, error } = await supabase.from("signals").insert(row).select().single();

  if (error && isMissingColumnError(error)) {
    console.warn(
      "[signals] signals table is missing source_type/activity_type — run the migration at " +
        "the bottom of supabase-schema.sql. Storing this signal without Reo's taxonomy pair for now."
    );
    const withoutReoPair: Record<string, unknown> = { ...row };
    delete withoutReoPair.source_type;
    delete withoutReoPair.activity_type;
    ({ data, error } = await supabase.from("signals").insert(withoutReoPair).select().single());
  }

  if (error) throw error;
  return data;
}

/**
 * Persists freshly-generated per-signal Claude summaries. Degrades
 * gracefully if the `signal_summary` migration hasn't been run yet — logs
 * one warning and stops, rather than failing the page for every signal.
 */
export async function saveSignalSummaries(summaries: Record<string, string>): Promise<void> {
  for (const [id, summary] of Object.entries(summaries)) {
    const { error } = await supabase.from("signals").update({ signal_summary: summary }).eq("id", id);
    if (error) {
      if (isMissingColumnError(error)) {
        console.warn(
          "[signals] signal_summary column not found — run the latest supabase-schema.sql migration to persist per-signal summaries"
        );
        return;
      }
      console.error("Failed to save signal summary for", id, error);
    }
  }
}
