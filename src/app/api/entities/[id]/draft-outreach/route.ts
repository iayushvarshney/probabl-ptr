import { NextResponse } from "next/server";
import { generateOutreachDraft } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const detail = await getEntityDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "entity not found" }, { status: 404 });
  }

  const draft = await generateOutreachDraft(detail);
  return NextResponse.json({ ok: true, draft });
}
