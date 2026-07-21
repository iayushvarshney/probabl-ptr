import { NextResponse } from "next/server";
import { generateOutreachDraft } from "@/lib/claude-summary";
import { getEntityDetail } from "@/lib/entity-detail";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { contactId?: string };

  const detail = await getEntityDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "entity not found" }, { status: 404 });
  }

  const targetContact =
    detail.contacts.find((c) => c.id === body.contactId) ??
    detail.contacts.find((c) => c.id === detail.primaryContactId);
  if (!targetContact) {
    return NextResponse.json({ error: "contact not found" }, { status: 404 });
  }

  const draft = await generateOutreachDraft(detail, targetContact);
  return NextResponse.json({ ok: true, draft });
}
