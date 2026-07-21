import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/EntityDetailView";
import { generateEntitySummary, generateSignalSummaries } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";
import { saveSignalSummaries } from "@/lib/signals";
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

  // Same generate-once-and-cache approach, per signal: only the signals
  // still missing a signal_summary (new ones since the last visit) get sent
  // to Claude; already-summarized signals are never re-generated.
  const unsummarized = detail.signals.filter((s) => !s.signalSummary);
  if (unsummarized.length > 0) {
    try {
      const companyName = detail.company.name ?? detail.company.domain ?? "this account";
      const summaries = await generateSignalSummaries(unsummarized, companyName);
      if (Object.keys(summaries).length > 0) {
        await saveSignalSummaries(summaries);
        detail = {
          ...detail,
          signals: detail.signals.map((s) =>
            summaries[s.id] ? { ...s, signalSummary: summaries[s.id] } : s
          ),
        };
      }
    } catch (err) {
      console.error("Signal summary generation failed for entity", id, err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <EntityDetailView detail={detail} />
    </div>
  );
}
