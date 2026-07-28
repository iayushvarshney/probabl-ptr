import { NextResponse } from "next/server";
import { generateContactRecommendations } from "@/lib/claude-summary";
import { saveContactOutreachRecommendations } from "@/lib/contacts";
import { getEntityDetail } from "@/lib/entity-detail";

/**
 * Generates (and caches, per-contact, in outreach_reason/outreach_rank) the
 * "who to reach out to" buying-committee ranking — the ONE place this ever
 * runs. Never called automatically on page load or on ingestion: only from
 * an explicit button click in the UI (first generate, or manual
 * regenerate), so it — and anything it might call in the future, e.g.
 * Surfe — never burns credits just from someone opening an entity.
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
  if (detail.contacts.length === 0) {
    return NextResponse.json({ ok: true, recommendations: {} });
  }

  const recommendations = await generateContactRecommendations(detail);
  await saveContactOutreachRecommendations(recommendations);

  return NextResponse.json({ ok: true, recommendations });
}
