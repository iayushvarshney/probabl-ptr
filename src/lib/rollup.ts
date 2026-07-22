import { isMissingColumnError } from "@/lib/db-errors";
import { resolveIdentity } from "@/lib/identity";
import {
  findCompanyByDomain,
  findContactByEmail,
  hasOpenDeal,
} from "@/lib/hubspot";
import { matchesIcp } from "@/lib/icp";
import { recomputeEntityScore } from "@/lib/recompute";
import { supabase } from "@/lib/supabase";
import type { IncomingSignal, RelationshipState } from "@/lib/types";

type CompanyRow = {
  id: string;
  domain: string | null;
  name: string | null;
  hubspot_company_id: string | null;
  is_target_account: boolean;
  has_open_opp: boolean;
  matches_icp: boolean;
  customer_fit?: string | null;
  activity_score?: string | null;
  activity_score_numeric?: number | null;
  industry?: string | null;
  employee_count_range?: string | null;
  preferred_technology?: string | null;
  country?: string | null;
};

// Reo enrichment columns (see supabase-schema.sql) — if the migration
// hasn't been run yet on a given environment, writes touching these
// columns fail with Postgres "undefined column" (42703). Rather than
// break the whole rollup (including plain PostHog signals) on that,
// detect it and silently retry without them, once, with a warning.
const ENRICHMENT_COLUMNS = [
  "customer_fit",
  "activity_score",
  "activity_score_numeric",
  "industry",
  "employee_count_range",
  "preferred_technology",
  "country",
] as const;

function withoutEnrichmentColumns<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  for (const key of ENRICHMENT_COLUMNS) delete (copy as Record<string, unknown>)[key];
  return copy;
}

async function writeCompanyRow(
  write: (
    row: Record<string, unknown>
  ) => PromiseLike<{ data: CompanyRow | null; error: unknown }>,
  row: Record<string, unknown>
): Promise<CompanyRow> {
  let { data, error } = await write(row);

  if (error && isMissingColumnError(error)) {
    console.warn(
      "[rollup] companies table is missing the Reo enrichment columns — run the migration " +
        "at the bottom of supabase-schema.sql. Persisting this company without them for now."
    );
    ({ data, error } = await write(withoutEnrichmentColumns(row)));
  }

  if (error) throw error;
  return data as CompanyRow;
}

type ContactRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_id: string | null;
  hubspot_contact_id: string | null;
};

type EntityRow = {
  id: string;
  company_id: string;
  relationship_state: RelationshipState;
  status: string;
  last_signal_at: string | null;
};

async function upsertCompany(params: {
  domain?: string;
  name?: string;
  /** When set, reuse this exact company row instead of looking one up by
   * domain/name — used for the no-reliable-domain case, where the caller
   * has already determined (via the contact's email) which no-domain
   * company row belongs to this specific person. */
  existingCompanyId?: string;
  hubspotCompanyId?: string;
  isTargetAccount?: boolean;
  hasOpenOpp?: boolean;
  // Reo account enrichment. industry/employeeCountRange/
  // preferredTechnology/country feed the ICP evaluation below.
  // TODO: consider customer_fit for matches_icp and activity_score for
  // signal intensity — customerFit/activityScore* are persisted only.
  customerFit?: string;
  activityScore?: string;
  activityScoreNumeric?: number;
  industry?: string;
  employeeCountRange?: string;
  preferredTechnology?: string;
  country?: string;
}): Promise<CompanyRow> {
  let existing: CompanyRow | null = null;

  if (params.existingCompanyId) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", params.existingCompanyId)
      .maybeSingle();
    existing = data;
  } else if (params.domain) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("domain", params.domain)
      .maybeSingle();
    existing = data;
  } else if (params.name) {
    // No reliable domain — best-effort match on name among other
    // domain-less companies. Never merges into a domain-known company.
    const { data } = await supabase
      .from("companies")
      .select("*")
      .is("domain", null)
      .ilike("name", params.name)
      .limit(1)
      .maybeSingle();
    existing = data;
  }

  const mergedDomain = params.domain ?? existing?.domain ?? null;
  const mergedName = params.name ?? existing?.name ?? null;
  const mergedIndustry = params.industry ?? existing?.industry ?? null;
  const mergedEmployeeCountRange =
    params.employeeCountRange ?? existing?.employee_count_range ?? null;
  const mergedPreferredTechnology =
    params.preferredTechnology ?? existing?.preferred_technology ?? null;
  const mergedCountry = params.country ?? existing?.country ?? null;

  // Evaluated against the merged (new-signal-or-existing) enrichment, so a
  // company's ICP match reflects everything we know about it, not just
  // whatever this one signal happened to carry.
  const icpMatch = await matchesIcp({
    domain: mergedDomain,
    name: mergedName,
    industry: mergedIndustry,
    employeeCountRange: mergedEmployeeCountRange,
    preferredTechnology: mergedPreferredTechnology,
    country: mergedCountry,
  });

  const merged = {
    domain: mergedDomain,
    name: mergedName,
    hubspot_company_id: params.hubspotCompanyId ?? existing?.hubspot_company_id ?? null,
    is_target_account: params.isTargetAccount ?? existing?.is_target_account ?? false,
    has_open_opp: params.hasOpenOpp ?? existing?.has_open_opp ?? false,
    matches_icp: icpMatch,
    customer_fit: params.customerFit ?? existing?.customer_fit ?? null,
    activity_score: params.activityScore ?? existing?.activity_score ?? null,
    activity_score_numeric:
      params.activityScoreNumeric ?? existing?.activity_score_numeric ?? null,
    industry: mergedIndustry,
    employee_count_range: mergedEmployeeCountRange,
    preferred_technology: mergedPreferredTechnology,
    country: mergedCountry,
  };

  if (existing) {
    return writeCompanyRow(
      (row) => supabase.from("companies").update(row).eq("id", existing.id).select().single(),
      merged
    );
  }

  if (params.domain) {
    return writeCompanyRow(
      (row) => supabase.from("companies").upsert(row, { onConflict: "domain" }).select().single(),
      merged
    );
  }

  return writeCompanyRow((row) => supabase.from("companies").insert(row).select().single(), merged);
}

async function upsertContact(params: {
  email?: string;
  fullName?: string;
  companyId: string;
  hubspotContactId?: string;
}): Promise<ContactRow> {
  if (params.email) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("*")
      .eq("email", params.email)
      .maybeSingle();

    const merged = {
      email: params.email,
      full_name: params.fullName ?? existing?.full_name ?? null,
      company_id: params.companyId,
      hubspot_contact_id: params.hubspotContactId ?? existing?.hubspot_contact_id ?? null,
    };

    const { data, error } = await supabase
      .from("contacts")
      .upsert(merged, { onConflict: "email" })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // No email — best-effort match by name within the same company. Never
  // silently merges across companies or onto an email-identified contact.
  let existing: ContactRow | null = null;
  if (params.fullName) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .is("email", null)
      .eq("company_id", params.companyId)
      .ilike("full_name", params.fullName)
      .limit(1)
      .maybeSingle();
    existing = data;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("contacts")
      .update({
        hubspot_contact_id: params.hubspotContactId ?? existing.hubspot_contact_id ?? null,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      email: null,
      full_name: params.fullName ?? null,
      company_id: params.companyId,
      hubspot_contact_id: params.hubspotContactId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function upsertEntity(params: {
  companyId: string;
  relationshipState: RelationshipState;
  lastSignalAt: string;
}): Promise<EntityRow> {
  const { data: existing } = await supabase
    .from("entities")
    .select("*")
    .eq("company_id", params.companyId)
    .maybeSingle();

  const lastSignalAt =
    existing?.last_signal_at && existing.last_signal_at > params.lastSignalAt
      ? existing.last_signal_at
      : params.lastSignalAt;

  const merged = {
    company_id: params.companyId,
    relationship_state: params.relationshipState,
    last_signal_at: lastSignalAt,
    status: existing?.status ?? "pending",
  };

  const { data, error } = await supabase
    .from("entities")
    .upsert(merged, { onConflict: "company_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Runs identity resolution + HubSpot cross-reference + rollup for one
 * already-stored signal: upserts the company/contact, classifies the
 * relationship state, sets the flags, links the signal to its entity, and
 * records the resolution confidence back onto the signal row.
 */
export async function rollupSignal(signal: IncomingSignal, signalId: string) {
  const identity = resolveIdentity(signal);

  const hubspotCompany = identity.company.domain
    ? await findCompanyByDomain(identity.company.domain)
    : null;

  const hubspotContact = identity.person.email
    ? await findContactByEmail(identity.person.email)
    : null;

  const isCompanyKnown = !!hubspotCompany;
  const isContactKnown = !!hubspotContact;

  const hasOpenOpp = hubspotCompany ? await hasOpenDeal(hubspotCompany.id) : undefined;

  // No reliable company domain (e.g. a free/personal email) — never group
  // by name/domain guessing here, since that's how unrelated people sharing
  // a free email provider previously got merged into one fake company. If
  // we've already seen this exact person, reuse their own no-company row;
  // otherwise upsertCompany below creates a fresh one scoped to just them.
  let existingNoDomainCompanyId: string | undefined;
  if (!identity.company.domain && identity.person.email) {
    const { data: existingContactRow } = await supabase
      .from("contacts")
      .select("company_id, companies(domain)")
      .eq("email", identity.person.email)
      .maybeSingle();
    const companiesField = existingContactRow?.companies as
      | { domain: string | null }
      | { domain: string | null }[]
      | null
      | undefined;
    const existingCompanyDomain = Array.isArray(companiesField)
      ? companiesField[0]?.domain
      : companiesField?.domain;
    if (existingContactRow?.company_id && !existingCompanyDomain) {
      existingNoDomainCompanyId = existingContactRow.company_id;
    }
  }

  const company = await upsertCompany({
    domain: identity.company.domain,
    name: identity.company.name ?? hubspotCompany?.name ?? undefined,
    existingCompanyId: existingNoDomainCompanyId,
    hubspotCompanyId: hubspotCompany?.id,
    isTargetAccount: hubspotCompany?.isTargetAccount,
    hasOpenOpp,
    customerFit: signal.company_enrichment?.customerFit,
    activityScore: signal.company_enrichment?.activityScore,
    activityScoreNumeric: signal.company_enrichment?.activityScoreNumeric,
    industry: signal.company_enrichment?.industry,
    employeeCountRange: signal.company_enrichment?.employeeCountRange,
    preferredTechnology: signal.company_enrichment?.preferredTechnology,
    country: signal.company_enrichment?.country,
  });

  const contact = await upsertContact({
    email: identity.person.email,
    fullName: identity.person.full_name,
    companyId: company.id,
    hubspotContactId: hubspotContact?.id,
  });

  const relationshipState: RelationshipState = !isCompanyKnown
    ? "NET_NEW_CONTACT_NET_NEW_COMPANY"
    : isContactKnown
      ? "KNOWN_CONTACT_KNOWN_COMPANY"
      : "NEW_CONTACT_KNOWN_COMPANY";

  const entity = await upsertEntity({
    companyId: company.id,
    relationshipState,
    lastSignalAt: signal.occurred_at,
  });

  await supabase
    .from("entity_signals")
    .upsert(
      { entity_id: entity.id, signal_id: signalId },
      { onConflict: "entity_id,signal_id", ignoreDuplicates: true }
    );

  await supabase
    .from("signals")
    .update({
      contact_id: contact.id,
      company_id: company.id,
      resolution_confidence: identity.confidence,
    })
    .eq("id", signalId);

  const scoredEntity = await recomputeEntityScore(entity.id);

  return { identity, company, contact, entity: scoredEntity };
}
