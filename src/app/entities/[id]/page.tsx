import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/EntityDetailView";
import {
  generateCompanyBlurb,
  generateContactRecommendations,
  generateEntitySummary,
} from "@/lib/claude-summary";
import { saveContactOutreachRecommendations } from "@/lib/contacts";
import { getEntityDetail } from "@/lib/entity-detail";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail = await getEntityDetail(id);
  if (!detail) notFound();

  // Generate the Claude summary once per entity, the first time it's
  // viewed, and cache it in claude_summary — never recomputed on subsequent
  // visits, and never touches the score.
  if (!detail.claudeSummary) {
    try {
      const summary = await generateEntitySummary(detail);
      if (summary) {
        const { error } = await supabase
          .from("entities")
          .update({ claude_summary: summary })
          .eq("id", id);
        if (error) throw error;
        detail = { ...detail, claudeSummary: summary };
      }
    } catch (err) {
      console.error("Claude summary generation failed for entity", id, err);
    }
  }

  // Same generate-once-and-cache approach for "who to reach out to" — one
  // combined Claude call ranking all of this entity's contacts (not one
  // call per contact), so it's cheap enough to run synchronously here.
  const unrankedContacts = detail.contacts.filter((c) => c.outreachReason == null);
  if (unrankedContacts.length > 0) {
    try {
      const recommendations = await generateContactRecommendations(detail);
      if (Object.keys(recommendations).length > 0) {
        await saveContactOutreachRecommendations(recommendations);
        detail = {
          ...detail,
          contacts: detail.contacts.map((c) =>
            recommendations[c.id]
              ? { ...c, outreachReason: recommendations[c.id].reason, outreachRank: recommendations[c.id].rank }
              : c
          ),
        };
      }
    } catch (err) {
      console.error("Contact recommendation generation failed for entity", id, err);
    }
  }

  // Same generate-once-and-cache approach for the "about this company"
  // blurb — factual background about who they are, distinct from the
  // GTM-focused claudeSummary above.
  if (!detail.company.aboutBlurb) {
    try {
      const blurb = await generateCompanyBlurb(detail.company);
      if (blurb) {
        const { error } = await supabase
          .from("companies")
          .update({ about_blurb: blurb })
          .eq("id", detail.company.id);
        if (error) throw error;
        detail = { ...detail, company: { ...detail.company, aboutBlurb: blurb } };
      }
    } catch (err) {
      console.error("Company blurb generation failed for company", detail.company.id, err);
    }
  }

  // Per-signal summaries and per-contact outreach drafts are generated on
  // demand (see /api/signals/[id]/summarize and /api/entities/[id]/draft-
  // outreach), triggered by opening a signal or a contact in the UI — not
  // here. Generating all of them up front was the page's dominant cost
  // (measured ~95% of an ~12s load for an entity with a handful of
  // uncached signals), most of which the user would never even look at.

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <EntityDetailView detail={detail} />
    </div>
  );
}
