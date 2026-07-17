import { supabase } from "@/lib/supabase";
import type { IncomingSignal } from "@/lib/types";

export async function insertSignal(signal: IncomingSignal) {
  const { data, error } = await supabase
    .from("signals")
    .insert({
      source: signal.source,
      signal_type: signal.signal_type,
      origin_channel: signal.origin_channel,
      campaign: signal.campaign ?? null,
      raw_payload: signal.raw_payload,
      person_identifier: signal.person_identifier,
      company_domain: signal.company_domain ?? null,
      occurred_at: signal.occurred_at,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
