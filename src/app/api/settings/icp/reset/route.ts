import { NextResponse } from "next/server";
import { recomputeAllCompaniesIcp } from "@/lib/icp";
import { recomputeAllEntityScores } from "@/lib/recompute";
import { resetIcpConfig } from "@/lib/settings";

export async function POST() {
  const { config, version } = await resetIcpConfig();
  const { evaluated, changed } = await recomputeAllCompaniesIcp();
  const rescoredCount = await recomputeAllEntityScores();

  return NextResponse.json({
    ok: true,
    config,
    version,
    evaluatedCompanies: evaluated,
    changedCompanies: changed,
    rescoredCount,
  });
}
