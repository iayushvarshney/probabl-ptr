import { isMissingColumnError } from "@/lib/db-errors";
import { getCompanyOwnerId } from "@/lib/hubspot";
import { supabase } from "@/lib/supabase";
import { timer } from "@/lib/timing";
import type {
  OriginChannel,
  RelationshipState,
  SignalSource,
  SignalType,
} from "@/lib/types";

export type EntityDetailContact = {
  id: string;
  email: string | null;
  fullName: string | null;
  hubspotContactId: string | null;
};

export type EntityDetailSignal = {
  id: string;
  source: SignalSource;
  signalType: SignalType;
  originChannel: OriginChannel;
  campaign: string | null;
  occurredAt: string;
  contactId: string | null;
  rawPayload: Record<string, unknown>;
  signalSummary: string | null;
};

export type EntityDetailPush = {
  hubspotTaskId: string | null;
  taskSubject: string | null;
  taskBody: string | null;
  assignee: string | null;
  dueDate: string | null;
  pushedAt: string;
};

export type EntityDetail = {
  id: string;
  relationshipState: RelationshipState;
  compositeScore: number;
  topReason: string | null;
  claudeSummary: string | null;
  status: "pending" | "pushed" | "dismissed";
  lastSignalAt: string | null;
  company: {
    id: string;
    name: string | null;
    domain: string | null;
    hubspotCompanyId: string | null;
    isTargetAccount: boolean;
    hasOpenOpp: boolean;
    matchesIcp: boolean;
  };
  contacts: EntityDetailContact[];
  signals: EntityDetailSignal[];
  /** The contact tied to the most recent signal — the natural "who to
   * reach out to" for the push action. Falls back to the first known
   * contact if signals are somehow missing. */
  primaryContactId: string | null;
  /** The company's current HubSpot owner, if any — pre-fills "Assigned to"
   * on the task-creation form. Null if the company isn't in HubSpot, has no
   * owner set, or the lookup fails. */
  defaultOwnerId: string | null;
  push: EntityDetailPush | null;
};

function asList<T>(value: T | T[] | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function getEntityDetail(entityId: string): Promise<EntityDetail | null> {
  const endTotal = timer(`getEntityDetail total (${entityId})`);

  const endEntity = timer("db: entities select");
  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .maybeSingle();
  endEntity();
  if (entityError) throw entityError;
  if (!entity) {
    endTotal();
    return null;
  }

  const endCompany = timer("db: companies select");
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", entity.company_id)
    .single();
  endCompany();
  if (companyError) throw companyError;

  const endContacts = timer("db: contacts select");
  const { data: contactRows, error: contactsError } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", entity.company_id)
    .order("updated_at", { ascending: false });
  endContacts();
  if (contactsError) throw contactsError;

  const SIGNAL_COLUMNS =
    "id, source, signal_type, origin_channel, campaign, occurred_at, contact_id, raw_payload, signal_summary";
  const SIGNAL_COLUMNS_WITHOUT_SUMMARY =
    "id, source, signal_type, origin_channel, campaign, occurred_at, contact_id, raw_payload";

  const endSignals = timer("db: entity_signals+signals select");
  let links: unknown;
  let linksError: { code?: string; message?: string } | null;
  {
    const first = await supabase
      .from("entity_signals")
      .select(`signals(${SIGNAL_COLUMNS})`)
      .eq("entity_id", entityId);
    links = first.data;
    linksError = first.error;
  }

  let hasSignalSummaryColumn = true;
  if (linksError && isMissingColumnError(linksError)) {
    hasSignalSummaryColumn = false;
    const endSignalsFallback = timer("db: entity_signals+signals select (fallback, no signal_summary column)");
    const fallback = await supabase
      .from("entity_signals")
      .select(`signals(${SIGNAL_COLUMNS_WITHOUT_SUMMARY})`)
      .eq("entity_id", entityId);
    endSignalsFallback();
    links = fallback.data;
    linksError = fallback.error;
  }
  endSignals();
  if (linksError) throw linksError;

  type RawSignal = {
    id: string;
    source: SignalSource;
    signal_type: SignalType;
    origin_channel: OriginChannel;
    campaign: string | null;
    occurred_at: string;
    contact_id: string | null;
    raw_payload: Record<string, unknown>;
    signal_summary?: string | null;
  };

  const signals: EntityDetailSignal[] = ((links ?? []) as unknown as Array<{
    signals: RawSignal | RawSignal[] | null;
  }>)
    .flatMap((link) => asList(link.signals))
    .map((s) => ({
      id: s.id,
      source: s.source,
      signalType: s.signal_type,
      originChannel: s.origin_channel,
      campaign: s.campaign,
      occurredAt: s.occurred_at,
      contactId: s.contact_id,
      rawPayload: s.raw_payload,
      signalSummary: hasSignalSummaryColumn ? s.signal_summary ?? null : null,
    }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const contacts: EntityDetailContact[] = (contactRows ?? []).map((c) => ({
    id: c.id,
    email: c.email,
    fullName: c.full_name,
    hubspotContactId: c.hubspot_contact_id,
  }));

  const endPushes = timer("db: pushes select");
  const { data: pushRow } = await supabase
    .from("pushes")
    .select("*")
    .eq("entity_id", entityId)
    .order("pushed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  endPushes();

  let defaultOwnerId: string | null = null;
  if (company.hubspot_company_id) {
    const endOwner = timer("hubspot: getCompanyOwnerId");
    try {
      defaultOwnerId = await getCompanyOwnerId(company.hubspot_company_id);
    } catch (err) {
      console.error("Failed to fetch default owner for company", company.id, err);
    } finally {
      endOwner();
    }
  }

  endTotal();
  return {
    id: entity.id,
    relationshipState: entity.relationship_state,
    compositeScore: entity.composite_score,
    topReason: entity.top_reason,
    claudeSummary: entity.claude_summary,
    status: entity.status,
    lastSignalAt: entity.last_signal_at,
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
      hubspotCompanyId: company.hubspot_company_id,
      isTargetAccount: company.is_target_account,
      hasOpenOpp: company.has_open_opp,
      matchesIcp: company.matches_icp,
    },
    contacts,
    signals,
    primaryContactId: signals[0]?.contactId ?? contacts[0]?.id ?? null,
    defaultOwnerId,
    push: pushRow
      ? {
          hubspotTaskId: pushRow.hubspot_task_id,
          taskSubject: pushRow.task_subject,
          taskBody: pushRow.task_body,
          assignee: pushRow.assignee,
          dueDate: pushRow.due_date,
          pushedAt: pushRow.pushed_at,
        }
      : null,
  };
}
