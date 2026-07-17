import { NextResponse } from "next/server";
import { listOwners } from "@/lib/hubspot";

export async function GET() {
  const owners = await listOwners();
  return NextResponse.json({ ok: true, owners });
}
