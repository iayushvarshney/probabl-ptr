import { NextResponse } from "next/server";
import { generateCompanyBlurb } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";
import { supabase } from "@/lib/supabase";

/**
 * Force-regenerates and re-caches one company's "about this company"
 * blurb — the manual "Regenerate" action in the UI. Normal page loads
 * never call this; they only generate once when about_blurb is null (see
 * entities/[id]/page.tsx and the invalidation in rollup.ts).
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

  const blurb = await generateCompanyBlurb(detail.company);
  if (!blurb) {
    return NextResponse.json({ error: "failed to generate blurb" }, { status: 502 });
  }

  const { error } = await supabase
    .from("companies")
    .update({ about_blurb: blurb })
    .eq("id", detail.company.id);
  if (error) throw error;

  return NextResponse.json({ ok: true, blurb });
}
