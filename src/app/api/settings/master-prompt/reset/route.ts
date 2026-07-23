import { NextResponse } from "next/server";
import { resetMasterPrompt } from "@/lib/settings";

export async function POST() {
  const { masterPrompt, version } = await resetMasterPrompt();
  return NextResponse.json({ ok: true, masterPrompt, version });
}
