import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/EntityDetailView";
import { generateCompanyBlurb, generateEntitySummary } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";
import { now, timedRecord } from "@/lib/perf";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Instrumentation to confirm a cached ("warm") open never calls Claude and
  // loads in ~1.5s — see src/lib/perf.ts.
  const pageStart = now();
  const timings: Array<{ operation: string; ms: number }> = [];

  let detail = await timedRecord(`entity:${id}:getEntityDetail (total)`, timings, () =>
    getEntityDetail(id)
  );
  if (!detail) notFound();

  // Claude summary and company blurb are each generate-once-and-cache
  // (claude_summary / about_blurb), invalidated only when a new signal
  // rolls up onto this entity (see rollup.ts) — never recomputed just from
  // opening the page. When a cold entity needs BOTH, they run in parallel
  // (not sequentially) so a first-ever open is ~4s, not ~8s. Contact
  // recommendations (the "who to reach out to" list) are NOT generated
  // here at all — that's fully on-demand via a button in the UI (see
  // /api/entities/[id]/contact-recommendations), so opening an entity never
  // triggers it, and never touches Surfe automatically.
  const needsSummary = !detail.claudeSummary;
  const needsBlurb = !detail.company.aboutBlurb;

  if (needsSummary || needsBlurb) {
    const [summaryResult, blurbResult] = await Promise.allSettled([
      needsSummary
        ? timedRecord(`entity:${id}:claude:generateEntitySummary`, timings, () =>
            generateEntitySummary(detail!)
          )
        : Promise.resolve(null),
      needsBlurb
        ? timedRecord(`entity:${id}:claude:generateCompanyBlurb`, timings, () =>
            generateCompanyBlurb(detail!.company)
          )
        : Promise.resolve(null),
    ]);

    if (needsSummary) {
      if (summaryResult.status === "fulfilled" && summaryResult.value) {
        const summary = summaryResult.value;
        const { error } = await supabase
          .from("entities")
          .update({ claude_summary: summary })
          .eq("id", id);
        if (error) console.error("Failed to persist claude_summary for entity", id, error);
        else detail = { ...detail, claudeSummary: summary };
      } else if (summaryResult.status === "rejected") {
        console.error("Claude summary generation failed for entity", id, summaryResult.reason);
      }
    }

    if (needsBlurb) {
      if (blurbResult.status === "fulfilled" && blurbResult.value) {
        const blurb = blurbResult.value;
        const { error } = await supabase
          .from("companies")
          .update({ about_blurb: blurb })
          .eq("id", detail.company.id);
        if (error) console.error("Failed to persist about_blurb for company", detail.company.id, error);
        else detail = { ...detail, company: { ...detail.company, aboutBlurb: blurb } };
      } else if (blurbResult.status === "rejected") {
        console.error("Company blurb generation failed for company", detail.company.id, blurbResult.reason);
      }
    }
  }

  // Per-signal summaries, per-contact outreach drafts, and contact
  // recommendations are all generated on demand (see
  // /api/signals/[id]/summarize, /api/entities/[id]/draft-outreach,
  // /api/entities/[id]/contact-recommendations), triggered by opening a
  // signal/contact or clicking a button in the UI — never here.

  const beforeJsx = now();
  const view = (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <EntityDetailView detail={detail} />
    </div>
  );
  timings.push({ operation: `entity:${id}:jsx-construction`, ms: Math.round(now() - beforeJsx) });

  const totalMs = Math.round(now() - pageStart);
  const accountedMs = timings.reduce((sum, t) => sum + t.ms, 0);
  console.log(`\n=== /entities/${id} load timing breakdown ===`);
  console.table([
    ...timings,
    { operation: "TOTAL (page function, server-side)", ms: totalMs },
    {
      operation: "unaccounted (React render/streaming/hydration, Next overhead)",
      ms: totalMs - accountedMs,
    },
  ]);

  return view;
}
