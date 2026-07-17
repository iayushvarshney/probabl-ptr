import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity) {
    return NextResponse.json({ error: "entity not found" }, { status: 404 });
  }

  // Deletes the company row itself, not just this entity — cascades to
  // entities/entity_signals/pushes (schema: ON DELETE CASCADE), and nulls
  // out company_id on any contacts/signals that reference it (ON DELETE
  // SET NULL) rather than deleting those rows outright.
  const { error: deleteError } = await supabase
    .from("companies")
    .delete()
    .eq("id", entity.company_id);
  if (deleteError) throw deleteError;

  return NextResponse.json({ ok: true });
}
