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

export const RELATIONSHIP_STATE_BADGE_CLASSES: Record<RelationshipState, string> = {
  NEW_CONTACT_KNOWN_COMPANY: "bg-persian-blue text-white",
  KNOWN_CONTACT_KNOWN_COMPANY: "bg-zinc-200 text-zinc-700",
  NET_NEW_CONTACT_NET_NEW_COMPANY: "border border-zinc-300 text-zinc-600",
};
