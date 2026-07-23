import type { RelationshipState } from "@/lib/types";

export const RELATIONSHIP_STATE_LABELS: Record<RelationshipState, string> = {
  NEW_CONTACT_KNOWN_COMPANY: "New contact · known company",
  KNOWN_CONTACT_KNOWN_COMPANY: "Known contact",
  NET_NEW_CONTACT_NET_NEW_COMPANY: "Net new",
};

// Highest-value state first, matching CLAUDE.md's framing of
// NEW_CONTACT_KNOWN_COMPANY as the key case worth surfacing first.
export const RELATIONSHIP_STATE_ORDER: RelationshipState[] = [
  "NEW_CONTACT_KNOWN_COMPANY",
  "KNOWN_CONTACT_KNOWN_COMPANY",
  "NET_NEW_CONTACT_NET_NEW_COMPANY",
];

// Distinct per-state color, not just a shade of the brand blue — makes the
// relationship state scannable at a glance across a list of many entities.
export const RELATIONSHIP_STATE_BADGE_CLASSES: Record<RelationshipState, string> = {
  // Highest-value case (CLAUDE.md) — kept as the strong brand-blue fill so
  // it reads as "the" priority signal, not just another category.
  NEW_CONTACT_KNOWN_COMPANY: "bg-persian-blue text-white",
  KNOWN_CONTACT_KNOWN_COMPANY: "border border-indigo-200 bg-indigo-50 text-indigo-700",
  NET_NEW_CONTACT_NET_NEW_COMPANY: "border border-amber-200 bg-amber-50 text-amber-700",
};

/** Not a RelationshipState — a cross-cutting HubSpot lifecycle-stage flag
 * that can co-occur with any of the three above (a customer can still be
 * e.g. "Known contact"). */
export const CUSTOMER_BADGE_CLASSES = "border border-green-200 bg-green-50 text-green-700";

/** Data-gap marker, not a relationship value judgment — kept neutral/gray,
 * just bordered for consistency with the other badges. */
export const NO_COMPANY_BADGE_CLASSES = "border border-slate-200 bg-slate-100 text-slate-500";
