import { NextResponse } from "next/server";
import { generateEntitySummary } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";
import { supabase } from "@/lib/supabase";

/**
 * Force-regenerates and re-caches one entity's Claude summary — the manual
 * "Regenerate" action in the UI. Normal page loads never call this; they
 * only generate once when claude_summary is null (see entities/[id]/page.tsx
 * and the invalidation in rollup.ts).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const detail = await getEntityDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "entity not found" }, { status: 404 });
  }

  const summary = await generateEntitySummary(detail);
  if (!summary) {
    return NextResponse.json({ error: "failed to generate summary" }, { status: 502 });
  }

  const { error } = await supabase.from("entities").update({ claude_summary: summary }).eq("id", id);
  if (error) throw error;

  return NextResponse.json({ ok: true, summary });
}
