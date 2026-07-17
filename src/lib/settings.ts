import { DEFAULT_ICP_CONFIG, type IcpConfig } from "@/lib/icp.config";
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from "@/lib/scoring.config";
import { supabase } from "@/lib/supabase";

type SettingsSection = "scoring" | "icp";

type SettingsRow = {
  id: string;
  section: SettingsSection;
  config_version: number;
  config: Record<string, unknown>;
  updated_at: string;
};

// JSON can't represent Infinity — the last recency-decay tier's maxDays is
// stored as null and rehydrated back to Infinity on read.
function serializeScoringWeights(weights: ScoringWeights): Record<string, unknown> {
  return {
    ...weights,
    recencyDecayTiers: weights.recencyDecayTiers.map((tier) => ({
      maxDays: Number.isFinite(tier.maxDays) ? tier.maxDays : null,
      multiplier: tier.multiplier,
    })),
  };
}

function deserializeScoringWeights(raw: Record<string, unknown>): ScoringWeights {
  const rawTiers = (raw.recencyDecayTiers as Array<{ maxDays: number | null; multiplier: number }>) ?? [];
  return {
    signalTypeWeights: raw.signalTypeWeights as ScoringWeights["signalTypeWeights"],
    recencyDecayTiers: rawTiers.map((tier) => ({
      maxDays: tier.maxDays === null || tier.maxDays === undefined ? Infinity : tier.maxDays,
      multiplier: tier.multiplier,
    })),
    relationshipWeights: raw.relationshipWeights as ScoringWeights["relationshipWeights"],
    netNewIcpBonusMultiplier: raw.netNewIcpBonusMultiplier as number,
    targetAccountMultiplier: raw.targetAccountMultiplier as number,
    nonTargetAccountMultiplier: raw.nonTargetAccountMultiplier as number,
  };
}

async function getLatestRow(section: SettingsSection): Promise<SettingsRow | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("section", section)
    .order("config_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Seeds version 1 from defaults the first time a section is read, and is
 * a no-op (just returns the current row) after that. */
async function seedIfMissing(
  section: SettingsSection,
  defaultConfig: Record<string, unknown>
): Promise<SettingsRow> {
  const existing = await getLatestRow(section);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("settings")
    .insert({ section, config_version: 1, config: defaultConfig })
    .select()
    .single();

  if (error) {
    // Lost a race to seed version 1 — someone else won it; use theirs.
    const winner = await getLatestRow(section);
    if (winner) return winner;
    throw error;
  }
  return data;
}

async function saveNewVersion(
  section: SettingsSection,
  config: Record<string, unknown>
): Promise<SettingsRow> {
  const current = await seedIfMissing(section, config);
  const nextVersion = current.config_version + 1;

  const { data, error } = await supabase
    .from("settings")
    .insert({ section, config_version: nextVersion, config })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Scoring -----------------------------------------------------------

export async function getScoringWeights(): Promise<ScoringWeights> {
  try {
    const row = await seedIfMissing("scoring", serializeScoringWeights(DEFAULT_SCORING_WEIGHTS));
    return deserializeScoringWeights(row.config);
  } catch (err) {
    console.warn(
      "[settings] Could not read scoring weights from the settings table (probably not " +
        "migrated yet) — using scoring.config.ts defaults.",
      err
    );
    return DEFAULT_SCORING_WEIGHTS;
  }
}

export async function getScoringWeightsRow(): Promise<{ weights: ScoringWeights; version: number }> {
  const row = await seedIfMissing("scoring", serializeScoringWeights(DEFAULT_SCORING_WEIGHTS));
  return { weights: deserializeScoringWeights(row.config), version: row.config_version };
}

export async function saveScoringWeights(weights: ScoringWeights): Promise<number> {
  const row = await saveNewVersion("scoring", serializeScoringWeights(weights));
  return row.config_version;
}

export async function resetScoringWeights(): Promise<{ weights: ScoringWeights; version: number }> {
  const row = await saveNewVersion("scoring", serializeScoringWeights(DEFAULT_SCORING_WEIGHTS));
  return { weights: DEFAULT_SCORING_WEIGHTS, version: row.config_version };
}

// --- ICP -----------------------------------------------------------------

export async function getIcpConfig(): Promise<IcpConfig> {
  try {
    const row = await seedIfMissing("icp", DEFAULT_ICP_CONFIG);
    return { ...DEFAULT_ICP_CONFIG, ...row.config } as IcpConfig;
  } catch (err) {
    console.warn(
      "[settings] Could not read ICP config from the settings table (probably not migrated " +
        "yet) — using empty defaults.",
      err
    );
    return DEFAULT_ICP_CONFIG;
  }
}

export async function getIcpConfigRow(): Promise<{ config: IcpConfig; version: number }> {
  const row = await seedIfMissing("icp", DEFAULT_ICP_CONFIG);
  return { config: { ...DEFAULT_ICP_CONFIG, ...row.config } as IcpConfig, version: row.config_version };
}

export async function saveIcpConfig(config: IcpConfig): Promise<number> {
  const row = await saveNewVersion("icp", config);
  return row.config_version;
}

export async function resetIcpConfig(): Promise<{ config: IcpConfig; version: number }> {
  const row = await saveNewVersion("icp", DEFAULT_ICP_CONFIG);
  return { config: DEFAULT_ICP_CONFIG, version: row.config_version };
}
