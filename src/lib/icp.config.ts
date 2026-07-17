// ICP config shape + defaults. Split out from icp.ts (the evaluation
// logic) so settings.ts can import this without a circular dependency
// (icp.ts depends on settings.ts for the live config; settings.ts only
// needs the shape/defaults, not the evaluation logic).

export type IcpConfig = {
  employeeCountRanges: string[];
  geographies: string[];
  includeIndustries: string[];
  technographics: string[];
  excludeIndustries: string[];
  excludeDomains: string[];
  neverTargetEntries: Array<{ domain: string; enabled: boolean }>;
  alwaysMatchDomains: string[];
};

// No real ICP is defined until someone saves one on the settings page —
// evaluateIcpConfig() treats an all-empty config as "no ICP defined yet"
// and returns false for every company, same as the old hardcoded stub.
export const DEFAULT_ICP_CONFIG: IcpConfig = {
  employeeCountRanges: [],
  geographies: [],
  includeIndustries: [],
  technographics: [],
  excludeIndustries: [],
  excludeDomains: [],
  neverTargetEntries: [],
  alwaysMatchDomains: [],
};

// Standard employee-count buckets — chosen to match Reo's
// employee_count_range enrichment values verbatim, so ICP size matching
// works directly against ingested data with no translation layer.
export const EMPLOYEE_COUNT_RANGE_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10001+",
];
