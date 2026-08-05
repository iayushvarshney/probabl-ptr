/** Shared across every analytics chart (see analytics.ts) for a row with no
 * value on file at all — reserved for genuinely missing data. For job
 * titles specifically, never used as a catch-all for titles that just
 * didn't match a known group (those keep their own, title-cased bucket
 * instead). */
export const UNKNOWN_LABEL = "Unknown / not captured";

type TitleGroup = {
  label: string;
  /** Matched as substrings against a lowercased, punctuation-stripped title. */
  keywords: string[];
};

// Keyword-based grouping, ordered most-specific-first — a title is assigned
// to the first group whose keyword matches. Scoped to the roles Probabl's
// audience (scikit-learn / data-science tooling) actually sees; titles that
// don't match any group fall back to their own bucket rather than "Other",
// so a real, distinct title never silently disappears into a catch-all.
const TITLE_GROUPS: TitleGroup[] = [
  {
    label: "ML / AI Engineer",
    keywords: ["machine learning", "ml engineer", "mlops", "ml ops", "ai engineer", "artificial intelligence"],
  },
  { label: "Data Scientist", keywords: ["data scientist", "data science"] },
  { label: "Data Engineer", keywords: ["data engineer", "analytics engineer"] },
  { label: "Data Analyst", keywords: ["data analyst", "business analyst", "analytics manager"] },
  { label: "Research Scientist", keywords: ["research scientist", "research engineer", "researcher"] },
  {
    label: "Software Engineer",
    keywords: [
      "software engineer",
      "backend",
      "back-end",
      "frontend",
      "front-end",
      "full stack",
      "fullstack",
      "developer",
      "programmer",
    ],
  },
  {
    label: "DevOps / Platform Engineer",
    keywords: ["devops", "platform engineer", "site reliability", "sre", "infrastructure engineer"],
  },
  {
    label: "Engineering Manager / Lead",
    keywords: [
      "engineering manager",
      "eng manager",
      "tech lead",
      "team lead",
      "head of engineering",
      "vp of engineering",
      "vp engineering",
      "director of engineering",
    ],
  },
  { label: "Product Manager", keywords: ["product manager", "product owner"] },
  { label: "Founder / Executive", keywords: ["founder", "ceo", "cto", "chief", "president"] },
  { label: "Professor / Academic", keywords: ["professor", "lecturer", "faculty", "postdoc"] },
  { label: "Student", keywords: ["student", "intern", "phd candidate", "graduate student", "undergraduate"] },
  { label: "Consultant", keywords: ["consultant", "advisor"] },
];

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** Buckets a raw contact title into a canonical group for the analytics
 * dashboard's job-title chart. Null/empty -> the reserved "Unknown / not
 * captured" bucket; anything not matching a known group keeps its own,
 * title-cased label instead of collapsing into a generic "Other". */
export function normalizeJobTitle(rawTitle: string | null | undefined): string {
  if (!rawTitle || !rawTitle.trim()) return UNKNOWN_LABEL;

  const normalized = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const group of TITLE_GROUPS) {
    if (group.keywords.some((keyword) => normalized.includes(keyword))) return group.label;
  }

  return titleCase(rawTitle.trim());
}
