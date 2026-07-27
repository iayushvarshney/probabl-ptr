import { formatSignalLabel } from "@/lib/format";
import type { ReoSourceType, ScoringWeights } from "@/lib/scoring.config";
import type { OriginChannel, RelationshipState, SignalType } from "@/lib/types";

export type ScorableSignal = {
  signal_type: SignalType;
  /** Reo's (source_type, activity_type) pair — set only for Reo signals
   * normalized after the taxonomy overhaul (see normalizers/reo.ts). When
   * both are present, scoring keys on this pair instead of signal_type. */
  source_type?: string | null;
  activity_type?: string | null;
  origin_channel: OriginChannel;
  occurred_at: string;
};

/** The weight for one signal: Reo's (source_type, activity_type) pair when
 * both are present — falling back to REO_DEFAULT_ACTIVITY_WEIGHT if that
 * exact pair isn't in the configured map — otherwise the flat
 * signalTypeWeights lookup (PostHog, and any pre-migration Reo rows that
 * never got backfilled with a source_type/activity_type pair). */
function weightForSignal(s: ScorableSignal, weights: ScoringWeights): number {
  if (s.source_type && s.activity_type) {
    const group = weights.reoActivityWeights[s.source_type as ReoSourceType];
    const mapped = group?.[s.activity_type];
    return mapped ?? weights.reoDefaultActivityWeight;
  }
  return weights.signalTypeWeights[s.signal_type] ?? 0;
}

/** Grouping/display key for "what kind of signal is this" — the
 * (source_type, activity_type) pair for Reo signals that have one,
 * signal_type otherwise. Keeps buildTopReason from lumping every Reo
 * activity together under the generic "dev_activity" catch-all. */
function signalGroupKey(s: ScorableSignal): string {
  return s.source_type && s.activity_type ? `${s.source_type}:${s.activity_type}` : s.signal_type;
}

function signalGroupLabel(s: ScorableSignal): string {
  return formatSignalLabel(s.signal_type, s.source_type, s.activity_type);
}

function daysBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
}

function recencyMultiplier(daysElapsed: number, tiers: ScoringWeights["recencyDecayTiers"]): number {
  const tier = tiers.find((t) => daysElapsed <= t.maxDays);
  return tier ? tier.multiplier : tiers[tiers.length - 1].multiplier;
}

function relationshipWeight(
  state: RelationshipState,
  matchesIcp: boolean,
  weights: ScoringWeights
): number {
  const base = weights.relationshipWeights[state];
  if (state === "NET_NEW_CONTACT_NET_NEW_COMPANY" && matchesIcp) {
    return base * weights.netNewIcpBonusMultiplier;
  }
  return base;
}

function signalIntensitySum(signals: ScorableSignal[], now: Date, weights: ScoringWeights): number {
  return signals.reduce((sum, s) => {
    const weight = weightForSignal(s, weights);
    return sum + weight * recencyMultiplier(daysBetween(s.occurred_at, now), weights.recencyDecayTiers);
  }, 0);
}

/**
 * composite_score = relationship_weight * signal_intensity_sum * target_multiplier
 * Deterministic — Claude must never compute this. Weights come from the
 * settings table (src/lib/settings.ts), which falls back to
 * scoring.config.ts's defaults — this function itself has no hardcoded
 * numbers.
 */
export function computeCompositeScore(params: {
  relationshipState: RelationshipState;
  isTargetAccount: boolean;
  matchesIcp: boolean;
  signals: ScorableSignal[];
  weights: ScoringWeights;
  now?: Date;
}): number {
  const now = params.now ?? new Date();
  const weight = relationshipWeight(params.relationshipState, params.matchesIcp, params.weights);
  const intensity = signalIntensitySum(params.signals, now, params.weights);
  const targetMultiplier = params.isTargetAccount
    ? params.weights.targetAccountMultiplier
    : params.weights.nonTargetAccountMultiplier;

  return weight * intensity * targetMultiplier;
}

function formatRecency(days: number): string {
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${Math.round(days)} days ago`;
}

/**
 * One-line, human-readable "why it ranks here" — built from whichever
 * signal type is contributing the most to the score. Purely mechanical
 * (no Claude involved), so it stays consistent with composite_score.
 */
export function buildTopReason(
  signals: ScorableSignal[],
  weights: ScoringWeights,
  now = new Date()
): string {
  if (signals.length === 0) return "No signals yet.";

  const byType = new Map<
    string,
    {
      label: string;
      count: number;
      contribution: number;
      mostRecentDays: number;
      channels: Set<OriginChannel>;
    }
  >();

  for (const s of signals) {
    const weight = weightForSignal(s, weights);
    const days = daysBetween(s.occurred_at, now);
    const contribution = weight * recencyMultiplier(days, weights.recencyDecayTiers);
    const key = signalGroupKey(s);

    const entry = byType.get(key) ?? {
      label: signalGroupLabel(s),
      count: 0,
      contribution: 0,
      mostRecentDays: Infinity,
      channels: new Set<OriginChannel>(),
    };
    entry.count += 1;
    entry.contribution += contribution;
    entry.mostRecentDays = Math.min(entry.mostRecentDays, days);
    entry.channels.add(s.origin_channel);
    byType.set(key, entry);
  }

  const [, top] = [...byType.entries()].sort((a, b) => b[1].contribution - a[1].contribution)[0];

  const countLabel = top.count > 1 ? `${top.count}x ${top.label}` : top.label;
  const channelLabel = [...top.channels].join(", ");

  return `${countLabel} via ${channelLabel} (most recent ${formatRecency(top.mostRecentDays)})`;
}
