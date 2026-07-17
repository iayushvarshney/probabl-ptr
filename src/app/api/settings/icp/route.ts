import { NextResponse } from "next/server";
import type { IcpConfig } from "@/lib/icp.config";
import { recomputeAllCompaniesIcp } from "@/lib/icp";
import { recomputeAllEntityScores } from "@/lib/recompute";
import { getIcpConfigRow, saveIcpConfig } from "@/lib/settings";

export async function GET() {
  const { config, version } = await getIcpConfigRow();
  return NextResponse.json({ ok: true, config, version });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { config?: IcpConfig };
  if (!body.config) {
    return NextResponse.json({ error: "config is required" }, { status: 400 });
  }

  const version = await saveIcpConfig(body.config);
  const { evaluated, changed } = await recomputeAllCompaniesIcp();
  // matches_icp feeds the NET_NEW ICP bonus multiplier, so a change there
  // can change entity scores too — keep the queue in sync.
  const rescoredCount = await recomputeAllEntityScores();

  return NextResponse.json({
    ok: true,
    version,
    evaluatedCompanies: evaluated,
    changedCompanies: changed,
    rescoredCount,
  });
}
