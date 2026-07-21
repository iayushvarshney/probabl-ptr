import { isMissingColumnError } from "@/lib/db-errors";
import { supabase } from "@/lib/supabase";

/**
 * Persists Claude's per-contact "who to reach out to and why" recommendation
 * (reason + rank). Degrades gracefully if the outreach_reason/outreach_rank
 * migration hasn't been run yet — logs one warning and stops.
 */
export async function saveContactOutreachRecommendations(
  recommendations: Record<string, { reason: string; rank: number }>
): Promise<void> {
  for (const [id, { reason, rank }] of Object.entries(recommendations)) {
    const { error } = await supabase
      .from("contacts")
      .update({ outreach_reason: reason, outreach_rank: rank })
      .eq("id", id);
    if (error) {
      if (isMissingColumnError(error)) {
        console.warn(
          "[contacts] outreach_reason/outreach_rank columns not found — run the latest supabase-schema.sql migration to persist outreach recommendations"
        );
        return;
      }
      console.error("Failed to save outreach recommendation for contact", id, error);
    }
  }
}
