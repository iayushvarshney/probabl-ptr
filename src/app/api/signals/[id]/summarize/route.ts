import { NextResponse } from "next/server";
import { generateSignalSummaries } from "@/lib/claude-summary";
import { isMissingColumnError } from "@/lib/db-errors";
import { saveSignalSummaries } from "@/lib/signals";
import { supabase } from "@/lib/supabase";
import type { OriginChannel, SignalSource, SignalType } from "@/lib/types";

const COLUMNS =
  "id, source, signal_type, origin_channel, campaign, occurred_at, raw_payload, signal_summary, company_id";
const COLUMNS_WITHOUT_SUMMARY =
  "id, source, signal_type, origin_channel, campaign, occurred_at, raw_payload, company_id";

type SignalRow = {
  id: string;
  source: SignalSource;
  signal_type: SignalType;
  origin_channel: OriginChannel;
  campaign: string | null;
  occurred_at: string;
  raw_payload: Record<string, unknown>;
  company_id: string | null;
  signal_summary?: string | null;
};

/**
 * Generates (and caches) a single signal's 2-3 line Claude summary, on
 * demand — called when the user opens a signal in the detail-page modal,
 * rather than eagerly for every signal on page load. See the note in
 * entities/[id]/page.tsx for why: eager generation was ~95% of the page's
 * load time.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let signal: unknown;
  let error: { code?: string; message?: string } | null;
  {
    const first = await supabase.from("signals").select(COLUMNS).eq("id", id).maybeSingle();
    signal = first.data;
    error = first.error;
  }
  let hasSignalSummaryColumn = true;
  if (error && isMissingColumnError(error)) {
    hasSignalSummaryColumn = false;
    const fallback = await supabase
      .from("signals")
      .select(COLUMNS_WITHOUT_SUMMARY)
      .eq("id", id)
      .maybeSingle();
    signal = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  if (!signal) {
    return NextResponse.json({ error: "signal not found" }, { status: 404 });
  }

  const row = signal as SignalRow;

  if (hasSignalSummaryColumn && row.signal_summary) {
    return NextResponse.json({ ok: true, summary: row.signal_summary });
  }

  let companyName = "this account";
  if (row.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name, domain")
      .eq("id", row.company_id)
      .maybeSingle();
    companyName = company?.name ?? company?.domain ?? companyName;
  }

  const summaries = await generateSignalSummaries(
    [
      {
        id: row.id,
        source: row.source,
        signalType: row.signal_type,
        originChannel: row.origin_channel,
        campaign: row.campaign,
        occurredAt: row.occurred_at,
        rawPayload: row.raw_payload,
      },
    ],
    companyName
  );

  const summary = summaries[row.id];
  if (!summary) {
    return NextResponse.json({ error: "failed to generate summary" }, { status: 502 });
  }

  await saveSignalSummaries({ [row.id]: summary });

  return NextResponse.json({ ok: true, summary });
}
