import type { ScoringWeights } from "@/lib/scoring.config";
import { buildTopReason, computeCompositeScore, type ScorableSignal } from "@/lib/scoring";
import { getScoringWeights } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import type { RelationshipState } from "@/lib/types";

// PostgREST returns a single nested object for this to-one relationship
// (entity_signals.signal_id -> signals.id), but supabase-js's untyped
// generic client infers it as an array — handle both shapes defensively.
type EntitySignalLink = {
  signals: ScorableSignal | ScorableSignal[] | null;
};

/**
 * Recomputes and persists composite_score + top_reason for one entity, from
 * its current relationship_state/flags and all signals linked to it so far.
 * Runs after every rollup so the queue always reflects the latest signals.
 * Pass an already-fetched `weights` when recomputing many entities in a
 * row (e.g. recomputeAllEntityScores) to avoid refetching settings per
 * entity; omit it to fetch the current live weights.
 */
export async function recomputeEntityScore(entityId: string, weights?: ScoringWeights) {
  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("id, relationship_state, company_id")
    .eq("id", entityId)
    .single();
  if (entityError) throw entityError;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("is_target_account, matches_icp")
    .eq("id", entity.company_id)
    .single();
  if (companyError) throw companyError;

  const { data: links, error: linksError } = await supabase
    .from("entity_signals")
    .select("signals(signal_type, origin_channel, occurred_at)")
    .eq("entity_id", entityId);
  if (linksError) throw linksError;

  const signals: ScorableSignal[] = ((links as unknown as EntitySignalLink[] | null) ?? []).flatMap(
    (link) => (Array.isArray(link.signals) ? link.signals : link.signals ? [link.signals] : [])
  );

  const resolvedWeights = weights ?? (await getScoringWeights());

  const compositeScore = computeCompositeScore({
    relationshipState: entity.relationship_state as RelationshipState,
    isTargetAccount: company.is_target_account,
    matchesIcp: company.matches_icp,
    signals,
    weights: resolvedWeights,
  });
  const topReason = buildTopReason(signals, resolvedWeights);

  const { data: updated, error: updateError } = await supabase
    .from("entities")
    .update({ composite_score: compositeScore, top_reason: topReason })
    .eq("id", entityId)
    .select()
    .single();
  if (updateError) throw updateError;

  return updated;
}

/** Recomputes every entity's score against the current live scoring
 * weights — used after saving new weights (or a new ICP) so the queue
 * re-ranks immediately. Returns how many entities were recomputed. */
export async function recomputeAllEntityScores(): Promise<number> {
  const weights = await getScoringWeights();

  const { data: entities, error } = await supabase.from("entities").select("id");
  if (error) throw error;

  for (const entity of entities ?? []) {
    await recomputeEntityScore(entity.id, weights);
  }

  return entities?.length ?? 0;
}
