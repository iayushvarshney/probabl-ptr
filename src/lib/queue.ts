import { supabase } from "@/lib/supabase";
import type { OriginChannel, RelationshipState } from "@/lib/types";

export type QueueEntity = {
  id: string;
  relationshipState: RelationshipState;
  compositeScore: number;
  topReason: string | null;
  lastSignalAt: string | null;
  companyName: string | null;
  companyDomain: string | null;
  isTargetAccount: boolean;
  hasOpenOpp: boolean;
  matchesIcp: boolean;
  originChannels: OriginChannel[];
  /** Only meaningful when companyName/companyDomain are both null — the
   * "No company" bucket's display identifier, since there's no company
   * name to show. */
  contactEmail: string | null;
};

type CompanyFields = {
  name: string | null;
  domain: string | null;
  is_target_account: boolean;
  has_open_opp: boolean;
  matches_icp: boolean;
};

// supabase-js's untyped generic client infers embedded to-one relations as
// arrays even though PostgREST returns a single object at runtime — handle
// both shapes defensively (same pattern as recompute.ts).
type EntityRow = {
  id: string;
  company_id: string;
  relationship_state: RelationshipState;
  composite_score: number;
  top_reason: string | null;
  last_signal_at: string | null;
  companies: CompanyFields | CompanyFields[] | null;
};

type EntitySignalLink = {
  entity_id: string;
  signals: { origin_channel: OriginChannel } | { origin_channel: OriginChannel }[] | null;
};

function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asList<T>(value: T | T[] | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Ranked, pending entities for the morning queue — highest score first. */
export async function getQueueEntities(): Promise<QueueEntity[]> {
  const { data, error } = await supabase
    .from("entities")
    .select(
      "id, company_id, relationship_state, composite_score, top_reason, last_signal_at, companies(name, domain, is_target_account, has_open_opp, matches_icp)"
    )
    .eq("status", "pending")
    .order("composite_score", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as EntityRow[];
  const entityIds = rows.map((r) => r.id);

  const channelsByEntity = new Map<string, Set<OriginChannel>>();
  if (entityIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("entity_signals")
      .select("entity_id, signals(origin_channel)")
      .in("entity_id", entityIds);
    if (linksError) throw linksError;

    for (const link of (links ?? []) as unknown as EntitySignalLink[]) {
      const set = channelsByEntity.get(link.entity_id) ?? new Set<OriginChannel>();
      for (const s of asList(link.signals)) set.add(s.origin_channel);
      channelsByEntity.set(link.entity_id, set);
    }
  }

  // Only needed for the "no company" display fallback — cheap to fetch for
  // every entity's company_id rather than conditionally, since it's one
  // bulk query either way.
  const contactEmailByCompany = new Map<string, string>();
  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  if (companyIds.length > 0) {
    const { data: contactRows, error: contactsError } = await supabase
      .from("contacts")
      .select("company_id, email")
      .in("company_id", companyIds)
      .not("email", "is", null)
      .order("updated_at", { ascending: false });
    if (contactsError) throw contactsError;
    for (const c of contactRows ?? []) {
      if (!contactEmailByCompany.has(c.company_id) && c.email) {
        contactEmailByCompany.set(c.company_id, c.email);
      }
    }
  }

  return rows.map((row) => {
    const company = firstOrSelf(row.companies);
    return {
      id: row.id,
      relationshipState: row.relationship_state,
      compositeScore: row.composite_score,
      topReason: row.top_reason,
      lastSignalAt: row.last_signal_at,
      companyName: company?.name ?? null,
      companyDomain: company?.domain ?? null,
      isTargetAccount: company?.is_target_account ?? false,
      hasOpenOpp: company?.has_open_opp ?? false,
      matchesIcp: company?.matches_icp ?? false,
      originChannels: [...(channelsByEntity.get(row.id) ?? [])].sort(),
      contactEmail: contactEmailByCompany.get(row.company_id) ?? null,
    };
  });
}
