import { EMPLOYEE_COUNT_RANGE_OPTIONS } from "@/lib/icp.config";
import { isMissingColumnError } from "@/lib/db-errors";
import { normalizeJobTitle, UNKNOWN_LABEL } from "@/lib/job-titles";
import { supabase } from "@/lib/supabase";

export { UNKNOWN_LABEL } from "@/lib/job-titles";

export type AnalyticsRange = "7d" | "30d" | "all";

export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

export type AnalyticsBucket = {
  label: string;
  count: number;
  isUnknown: boolean;
};

export type AnalyticsChart = {
  buckets: AnalyticsBucket[];
  /** Total rows in scope for this chart (companies or contacts, depending on
   * the field) — the denominator behind the "based on N" coverage note. */
  total: number;
  /** Rows where the field is actually populated (total minus the Unknown
   * bucket's count). */
  populated: number;
  unknown: number;
};

export type AnalyticsSnapshot = {
  industries: AnalyticsChart;
  companySize: AnalyticsChart;
  countries: AnalyticsChart;
  jobTitles: AnalyticsChart;
};

type CompanyRow = {
  id: string;
  industry: string | null;
  employee_count_range: string | null;
  country: string | null;
};

type ContactRow = {
  id: string;
  company_id: string | null;
  title: string | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** contacts.title isn't guaranteed to exist yet (it's part of the Reo
 * Developer-webhook migration in supabase-schema.sql, which some
 * environments haven't run) — same missing-column-safe pattern used
 * elsewhere (see rollup.ts, queue.ts). Falls back to treating every title
 * as unknown rather than failing the whole dashboard. */
async function fetchContacts(): Promise<ContactRow[]> {
  const { data, error } = await supabase.from("contacts").select("id, company_id, title");
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase.from("contacts").select("id, company_id");
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []).map((row) => ({ ...row, title: null }));
  }
  if (error) throw error;
  return data ?? [];
}

function buildChart(values: Array<string | null>, order?: string[]): AnalyticsChart {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = raw && raw.trim() ? raw.trim() : UNKNOWN_LABEL;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets = [...counts.entries()].map(([label, count]) => ({
    label,
    count,
    isUnknown: label === UNKNOWN_LABEL,
  }));

  if (order) {
    const orderIndex = new Map(order.map((label, i) => [label, i]));
    buckets.sort((a, b) => {
      const ai = orderIndex.get(a.label);
      const bi = orderIndex.get(b.label);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return b.count - a.count; // values outside the known order (incl. Unknown), by count
    });
  } else {
    buckets.sort((a, b) => b.count - a.count);
  }

  const total = values.length;
  const unknown = counts.get(UNKNOWN_LABEL) ?? 0;
  return { buckets, total, populated: total - unknown, unknown };
}

function snapshotFor(
  companies: CompanyRow[],
  contacts: ContactRow[],
  companyScope: Set<string> | null,
  contactScope: Set<string> | null
): AnalyticsSnapshot {
  const scopedCompanies = companyScope ? companies.filter((c) => companyScope.has(c.id)) : companies;
  const scopedContacts = contactScope ? contacts.filter((c) => contactScope.has(c.id)) : contacts;

  return {
    industries: buildChart(scopedCompanies.map((c) => c.industry)),
    companySize: buildChart(
      scopedCompanies.map((c) => c.employee_count_range),
      EMPLOYEE_COUNT_RANGE_OPTIONS
    ),
    countries: buildChart(scopedCompanies.map((c) => c.country)),
    jobTitles: buildChart(scopedContacts.map((c) => normalizeJobTitle(c.title))),
  };
}

/**
 * Precomputes all three date-range snapshots (7d / 30d / all-time) from a
 * single set of reads — one companies query, one contacts query, one signals
 * query scoped to the broadest window (30d) — rather than re-querying per
 * range. "All time" uses every row in companies/contacts directly (those
 * tables only ever contain companies/contacts that came from a resolved
 * signal, so no further scoping is needed); 7d/30d scope down to the
 * companies/contacts with at least one signal in that window.
 */
export async function getAnalyticsData(): Promise<Record<AnalyticsRange, AnalyticsSnapshot>> {
  const now = Date.now();
  const cutoff30Iso = new Date(now - THIRTY_DAYS_MS).toISOString();
  const cutoff7Ms = now - SEVEN_DAYS_MS;

  const [companiesResult, contacts, signalsResult] = await Promise.all([
    supabase.from("companies").select("id, industry, employee_count_range, country"),
    fetchContacts(),
    supabase.from("signals").select("company_id, contact_id, occurred_at").gte("occurred_at", cutoff30Iso),
  ]);

  if (companiesResult.error) throw companiesResult.error;
  if (signalsResult.error) throw signalsResult.error;

  const companies = (companiesResult.data ?? []) as CompanyRow[];

  const companyIds30 = new Set<string>();
  const companyIds7 = new Set<string>();
  const contactIds30 = new Set<string>();
  const contactIds7 = new Set<string>();

  for (const signal of signalsResult.data ?? []) {
    const occurredMs = new Date(signal.occurred_at).getTime();
    const withinLast7 = occurredMs >= cutoff7Ms;
    if (signal.company_id) {
      companyIds30.add(signal.company_id);
      if (withinLast7) companyIds7.add(signal.company_id);
    }
    if (signal.contact_id) {
      contactIds30.add(signal.contact_id);
      if (withinLast7) contactIds7.add(signal.contact_id);
    }
  }

  return {
    "7d": snapshotFor(companies, contacts, companyIds7, contactIds7),
    "30d": snapshotFor(companies, contacts, companyIds30, contactIds30),
    all: snapshotFor(companies, contacts, null, null),
  };
}
