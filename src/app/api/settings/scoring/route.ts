import { NextResponse } from "next/server";
import { recomputeAllEntityScores } from "@/lib/recompute";
import type { ScoringWeights } from "@/lib/scoring.config";
import { getScoringWeightsRow, saveScoringWeights } from "@/lib/settings";

export async function GET() {
  const { weights, version } = await getScoringWeightsRow();
  return NextResponse.json({ ok: true, weights, version });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { weights?: ScoringWeights };
  if (!body.weights) {
    return NextResponse.json({ error: "weights is required" }, { status: 400 });
  }

  const version = await saveScoringWeights(body.weights);
  const rescoredCount = await recomputeAllEntityScores();

  return NextResponse.json({ ok: true, version, rescoredCount });
}
