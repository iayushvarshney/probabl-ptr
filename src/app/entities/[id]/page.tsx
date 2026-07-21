import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/EntityDetailView";
import { generateEntitySummary, generateSignalSummaries } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";
import { saveSignalSummaries } from "@/lib/signals";
import { supabase } from "@/lib/supabase";
import { timer } from "@/lib/timing";

export const dynamic = "force-dynamic";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const endPage = timer("PAGE TOTAL (entities/[id])");
  const { id } = await params;

  const endGetDetail = timer("getEntityDetail (called from page)");
  let detail = await getEntityDetail(id);
  endGetDetail();
  if (!detail) {
    endPage();
    notFound();
  }

  // Generate the Claude summary once per entity, the first time it's
  // viewed, and cache it in claude_summary — never recomputed on subsequent
  // visits, and never touches the score.
  if (!detail.claudeSummary) {
    const endEntitySummary = timer("claude: generateEntitySummary + db save");
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
    } finally {
      endEntitySummary();
    }
  } else {
    console.log("[timing] claude: generateEntitySummary skipped (cached)");
  }

  // Same generate-once-and-cache approach, per signal: only the signals
  // still missing a signal_summary (new ones since the last visit) get sent
  // to Claude; already-summarized signals are never re-generated.
  const unsummarized = detail.signals.filter((s) => !s.signalSummary);
  if (unsummarized.length > 0) {
    const endSignalSummaries = timer(
      `claude: generateSignalSummaries + db save (${unsummarized.length}/${detail.signals.length} signals)`
    );
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
    } finally {
      endSignalSummaries();
    }
  } else {
    console.log(
      `[timing] claude: generateSignalSummaries skipped (all ${detail.signals.length} signals cached)`
    );
  }

  const endRenderPrep = timer("render prep (JSX construction, pre-return)");
  const jsx = (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <EntityDetailView detail={detail} />
    </div>
  );
  endRenderPrep();

  endPage();
  return jsx;
}
