import { NextResponse } from "next/server";
import { getMasterPromptRow, saveMasterPrompt } from "@/lib/settings";

export async function GET() {
  const { masterPrompt, version } = await getMasterPromptRow();
  return NextResponse.json({ ok: true, masterPrompt, version });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { masterPrompt?: string };
  if (typeof body.masterPrompt !== "string") {
    return NextResponse.json({ error: "masterPrompt is required" }, { status: 400 });
  }

  // No recompute here, deliberately — the master prompt only affects
  // outreach drafting, never scoring/prioritization.
  const version = await saveMasterPrompt(body.masterPrompt);

  return NextResponse.json({ ok: true, version });
}
