import { NextResponse } from "next/server";
import { recomputeAllEntityScores } from "@/lib/recompute";
import { resetScoringWeights } from "@/lib/settings";

export async function POST() {
  const { weights, version } = await resetScoringWeights();
  const rescoredCount = await recomputeAllEntityScores();

  return NextResponse.json({ ok: true, weights, version, rescoredCount });
}
