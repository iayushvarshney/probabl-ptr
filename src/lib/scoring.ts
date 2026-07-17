import type { ScoringWeights } from "@/lib/scoring.config";
import type { OriginChannel, RelationshipState, SignalType } from "@/lib/types";

export type ScorableSignal = {
  signal_type: SignalType;
  origin_channel: OriginChannel;
  occurred_at: string;
};

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
    const weight = weights.signalTypeWeights[s.signal_type] ?? 0;
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

function humanizeSignalType(type: SignalType): string {
  return type.replace(/_/g, " ");
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
    SignalType,
    { count: number; contribution: number; mostRecentDays: number; channels: Set<OriginChannel> }
  >();

  for (const s of signals) {
    const weight = weights.signalTypeWeights[s.signal_type] ?? 0;
    const days = daysBetween(s.occurred_at, now);
    const contribution = weight * recencyMultiplier(days, weights.recencyDecayTiers);

    const entry = byType.get(s.signal_type) ?? {
      count: 0,
      contribution: 0,
      mostRecentDays: Infinity,
      channels: new Set<OriginChannel>(),
    };
    entry.count += 1;
    entry.contribution += contribution;
    entry.mostRecentDays = Math.min(entry.mostRecentDays, days);
    entry.channels.add(s.origin_channel);
    byType.set(s.signal_type, entry);
  }

  const [topType, top] = [...byType.entries()].sort(
    (a, b) => b[1].contribution - a[1].contribution
  )[0];

  const label = humanizeSignalType(topType);
  const countLabel = top.count > 1 ? `${top.count}x ${label}` : label;
  const channelLabel = [...top.channels].join(", ");

  return `${countLabel} via ${channelLabel} (most recent ${formatRecency(top.mostRecentDays)})`;
}
