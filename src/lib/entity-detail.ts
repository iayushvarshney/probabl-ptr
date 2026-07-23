import { isMissingColumnError } from "@/lib/db-errors";
import { findOpenDealStage, getCompanyDetails, getCompanyOwnerId } from "@/lib/hubspot";
import { supabase } from "@/lib/supabase";
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
  /** Claude's "why reach out to this person" reasoning, generated once per
   * entity view and cached — same generate-once pattern as signalSummary. */
  outreachReason: string | null;
  /** 1 = Claude's top recommendation; null if not yet generated. */
  outreachRank: number | null;
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
  contactId: string | null;
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
    /** HubSpot's industry property when the company is matched there;
     * falls back to our own stored (Reo-enrichment) industry otherwise. */
    industry: string | null;
    /** HubSpot lifecycle stage (Lead, MQL, SQL, Opportunity, Customer,
     * etc.) — null if the company isn't in HubSpot. */
    lifecycleStage: string | null;
    /** True when HubSpot's lifecycle stage is "customer" — derived,
     * defensive convenience flag (see companies.is_customer). */
    isCustomer: boolean;
    /** The open deal's pipeline stage, if any (e.g. "Discovery", "Demo
     * scheduled") — null if there's no open deal. */
    dealStage: string | null;
    /** HubSpot's hs_lastmodifieddate on the company record — the simplest
     * universally-available "last activity" signal. */
    lastActivityDate: string | null;
    /** HubSpot's website property if set (may differ from domain — full
     * URL, alternate subdomain, etc.); falls back to https://{domain}. */
    website: string | null;
    /** Claude's 2-3 line "about this company" blurb, generated once per
     * company and cached — null until the first entity-detail view for it. */
    aboutBlurb: string | null;
  };
  contacts: EntityDetailContact[];
  signals: EntityDetailSignal[];
  /** The contact tied to the most recent signal — used only as a fallback
   * ordering hint if outreach ranking hasn't been generated yet. */
  primaryContactId: string | null;
  /** The company's current HubSpot owner, if any — pre-fills "Assigned to"
   * on the task-creation form. Null if the company isn't in HubSpot, has no
   * owner set, or the lookup fails. */
  defaultOwnerId: string | null;
  /** One push per (entity, contact) pair — a rep can push a task for one
   * contact and later push a different one for the same company. */
  pushes: EntityDetailPush[];
};

function asList<T>(value: T | T[] | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function getEntityDetail(entityId: string): Promise<EntityDetail | null> {
  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityId)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity) return null;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", entity.company_id)
    .single();
  if (companyError) throw companyError;

  const CONTACT_COLUMNS = "*, outreach_reason, outreach_rank";
  let contactRows: unknown;
  let contactsError: { code?: string; message?: string } | null;
  {
    const first = await supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("company_id", entity.company_id)
      .order("updated_at", { ascending: false });
    contactRows = first.data;
    contactsError = first.error;
  }
  let hasOutreachColumns = true;
  if (contactsError && isMissingColumnError(contactsError)) {
    hasOutreachColumns = false;
    const fallback = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", entity.company_id)
      .order("updated_at", { ascending: false });
    contactRows = fallback.data;
    contactsError = fallback.error;
  }
  if (contactsError) throw contactsError;

  type RawContact = {
    id: string;
    email: string | null;
    full_name: string | null;
    hubspot_contact_id: string | null;
    outreach_reason?: string | null;
    outreach_rank?: number | null;
  };

  const SIGNAL_COLUMNS =
    "id, source, signal_type, origin_channel, campaign, occurred_at, contact_id, raw_payload, signal_summary";
  const SIGNAL_COLUMNS_WITHOUT_SUMMARY =
    "id, source, signal_type, origin_channel, campaign, occurred_at, contact_id, raw_payload";

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
    const fallback = await supabase
      .from("entity_signals")
      .select(`signals(${SIGNAL_COLUMNS_WITHOUT_SUMMARY})`)
      .eq("entity_id", entityId);
    links = fallback.data;
    linksError = fallback.error;
  }
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

  const contacts: EntityDetailContact[] = ((contactRows ?? []) as RawContact[]).map((c) => ({
    id: c.id,
    email: c.email,
    fullName: c.full_name,
    hubspotContactId: c.hubspot_contact_id,
    outreachReason: hasOutreachColumns ? c.outreach_reason ?? null : null,
    outreachRank: hasOutreachColumns ? c.outreach_rank ?? null : null,
  }));

  const PUSH_COLUMNS = "*, contact_id";
  let pushRows: unknown;
  let pushesError: { code?: string; message?: string } | null;
  {
    const first = await supabase
      .from("pushes")
      .select(PUSH_COLUMNS)
      .eq("entity_id", entityId)
      .order("pushed_at", { ascending: false });
    pushRows = first.data;
    pushesError = first.error;
  }
  let hasPushContactColumn = true;
  if (pushesError && isMissingColumnError(pushesError)) {
    hasPushContactColumn = false;
    const fallback = await supabase
      .from("pushes")
      .select("*")
      .eq("entity_id", entityId)
      .order("pushed_at", { ascending: false });
    pushRows = fallback.data;
    pushesError = fallback.error;
  }
  if (pushesError) throw pushesError;

  type RawPush = {
    contact_id?: string | null;
    hubspot_task_id: string | null;
    task_subject: string | null;
    task_body: string | null;
    assignee: string | null;
    due_date: string | null;
    pushed_at: string;
  };

  const pushes: EntityDetailPush[] = ((pushRows ?? []) as RawPush[]).map((p) => ({
    contactId: hasPushContactColumn ? p.contact_id ?? null : null,
    hubspotTaskId: p.hubspot_task_id,
    taskSubject: p.task_subject,
    taskBody: p.task_body,
    assignee: p.assignee,
    dueDate: p.due_date,
    pushedAt: p.pushed_at,
  }));

  let defaultOwnerId: string | null = null;
  let hubspotIndustry: string | null = null;
  let lifecycleStage: string | null = null;
  let lastActivityDate: string | null = null;
  let website: string | null = null;
  let dealStage: string | null = null;
  if (company.hubspot_company_id) {
    const [ownerResult, detailsResult, dealStageResult] = await Promise.allSettled([
      getCompanyOwnerId(company.hubspot_company_id),
      getCompanyDetails(company.hubspot_company_id),
      findOpenDealStage(company.hubspot_company_id),
    ]);
    if (ownerResult.status === "fulfilled") {
      defaultOwnerId = ownerResult.value;
    } else {
      console.error("Failed to fetch default owner for company", company.id, ownerResult.reason);
    }
    if (detailsResult.status === "fulfilled") {
      hubspotIndustry = detailsResult.value.industry;
      lifecycleStage = detailsResult.value.lifecycleStage;
      lastActivityDate = detailsResult.value.lastActivityDate;
      website = detailsResult.value.website;
    } else {
      console.error("Failed to fetch HubSpot company details for", company.id, detailsResult.reason);
    }
    if (dealStageResult.status === "fulfilled") {
      dealStage = dealStageResult.value;
    } else {
      console.error("Failed to fetch open deal stage for company", company.id, dealStageResult.reason);
    }
  }

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
      industry: hubspotIndustry ?? company.industry ?? null,
      lifecycleStage: lifecycleStage ?? company.hubspot_lifecycle_stage ?? null,
      isCustomer: company.is_customer ?? false,
      dealStage,
      lastActivityDate,
      website: website ?? (company.domain ? `https://${company.domain}` : null),
      aboutBlurb: company.about_blurb ?? null,
    },
    contacts,
    signals,
    primaryContactId: signals[0]?.contactId ?? contacts[0]?.id ?? null,
    defaultOwnerId,
    pushes,
  };
}
