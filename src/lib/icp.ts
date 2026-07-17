import { isMissingColumnError } from "@/lib/db-errors";
import { type IcpConfig } from "@/lib/icp.config";
import { getIcpConfig } from "@/lib/settings";
import { supabase } from "@/lib/supabase";

export type { IcpConfig } from "@/lib/icp.config";

export type IcpEvaluationInput = {
  domain: string | null;
  name: string | null;
  industry: string | null;
  employeeCountRange: string | null;
  preferredTechnology: string | null;
  country: string | null;
};

function normalizeDomain(domain: string | null | undefined): string {
  return (domain ?? "").trim().toLowerCase().replace(/^www\./, "");
}

function includesCaseInsensitive(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

/**
 * Evaluates one company against a saved ICP config:
 * - An explicit always-match domain overrides everything, including
 *   exclusions.
 * - If no inclusion criteria are configured at all, returns false — same
 *   conservative default as the old hardcoded stub, so an undefined ICP
 *   never silently inflates scores.
 * - Otherwise, any exclusion (domain, enabled "never target" entry,
 *   excluded industry) hard-fails regardless of other fits, and every
 *   *configured* inclusion dimension must match (an unconfigured
 *   dimension imposes no constraint).
 */
export function evaluateIcpConfig(company: IcpEvaluationInput, config: IcpConfig): boolean {
  const domain = normalizeDomain(company.domain);

  if (domain && config.alwaysMatchDomains.some((d) => normalizeDomain(d) === domain)) {
    return true;
  }

  const hasAnyInclusionCriteria =
    config.employeeCountRanges.length > 0 ||
    config.geographies.length > 0 ||
    config.includeIndustries.length > 0 ||
    config.technographics.length > 0;

  if (!hasAnyInclusionCriteria) return false;

  if (domain && config.excludeDomains.some((d) => normalizeDomain(d) === domain)) return false;
  if (
    domain &&
    config.neverTargetEntries.some((entry) => entry.enabled && normalizeDomain(entry.domain) === domain)
  ) {
    return false;
  }
  if (
    company.industry &&
    config.excludeIndustries.some((industry) => includesCaseInsensitive(company.industry, industry))
  ) {
    return false;
  }

  const sizeOk =
    config.employeeCountRanges.length === 0 ||
    (!!company.employeeCountRange && config.employeeCountRanges.includes(company.employeeCountRange));

  const geoOk =
    config.geographies.length === 0 ||
    (!!company.country && config.geographies.some((g) => includesCaseInsensitive(company.country, g)));

  const industryOk =
    config.includeIndustries.length === 0 ||
    (!!company.industry && config.includeIndustries.some((i) => includesCaseInsensitive(company.industry, i)));

  const techOk =
    config.technographics.length === 0 ||
    (!!company.preferredTechnology &&
      config.technographics.some((t) => includesCaseInsensitive(company.preferredTechnology, t)));

  return sizeOk && geoOk && industryOk && techOk;
}

/**
 * Fetches the current saved ICP config and evaluates one company against
 * it. Main entry point used per-signal by rollup.ts. For bulk recompute
 * over many companies, load the config once with getIcpConfig() and call
 * evaluateIcpConfig() directly instead — avoids refetching settings per
 * company.
 */
export async function matchesIcp(company: IcpEvaluationInput): Promise<boolean> {
  const config = await getIcpConfig();
  return evaluateIcpConfig(company, config);
}

type IcpCompanyRow = {
  id: string;
  domain: string | null;
  name: string | null;
  industry: string | null;
  employee_count_range: string | null;
  preferred_technology: string | null;
  country: string | null;
  matches_icp: boolean;
};

async function fetchCompaniesForIcpRecompute(): Promise<IcpCompanyRow[]> {
  const fullSelect =
    "id, domain, name, industry, employee_count_range, preferred_technology, country, matches_icp";

  let { data, error } = await supabase.from("companies").select(fullSelect);

  if (error && isMissingColumnError(error)) {
    console.warn(
      "[icp] companies table is missing the enrichment columns — run the migration in " +
        "supabase-schema.sql. Evaluating ICP without industry/employee-count/technology/" +
        "country for now."
    );
    ({ data, error } = await supabase.from("companies").select("id, domain, name, matches_icp"));
  }

  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    domain: c.domain,
    name: c.name,
    industry: c.industry ?? null,
    employee_count_range: c.employee_count_range ?? null,
    preferred_technology: c.preferred_technology ?? null,
    country: c.country ?? null,
    matches_icp: c.matches_icp,
  }));
}

/** Re-evaluates matches_icp for every company against the current saved
 * ICP config. Returns how many companies were looked at vs. actually
 * changed value. */
export async function recomputeAllCompaniesIcp(): Promise<{ evaluated: number; changed: number }> {
  const config = await getIcpConfig();
  const companies = await fetchCompaniesForIcpRecompute();

  let changed = 0;
  for (const company of companies) {
    const newValue = evaluateIcpConfig(
      {
        domain: company.domain,
        name: company.name,
        industry: company.industry,
        employeeCountRange: company.employee_count_range,
        preferredTechnology: company.preferred_technology,
        country: company.country,
      },
      config
    );

    if (newValue !== company.matches_icp) {
      const { error } = await supabase
        .from("companies")
        .update({ matches_icp: newValue })
        .eq("id", company.id);
      if (error) throw error;
      changed++;
    }
  }

  return { evaluated: companies.length, changed };
}
