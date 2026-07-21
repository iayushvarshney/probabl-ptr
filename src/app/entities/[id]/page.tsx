import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/EntityDetailView";
import { generateEntitySummary } from "@/lib/claude-summary";
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

  // Per-signal summaries are generated on demand (see
  // /api/signals/[id]/summarize), triggered when a signal is opened in the
  // UI — not here. Generating all of them up front was the page's dominant
  // cost (measured ~95% of an ~12s load for an entity with a handful of
  // uncached signals), most of which the user would never even look at.

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <EntityDetailView detail={detail} />
    </div>
  );
}
