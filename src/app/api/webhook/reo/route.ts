import { NextResponse } from "next/server";
import { normalizeReoSignal } from "@/lib/normalizers/reo";
import { rollupSignal } from "@/lib/rollup";
import { insertSignal } from "@/lib/signals";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

// Reachability check — some webhook UIs (Reo included) probe the URL with a
// plain GET/HEAD before saving it. Always answer 200 here; no signal
// processing happens on this path, so it doesn't weaken the POST auth check.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  if (!isAuthorizedWebhook(request, process.env.REO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty/non-JSON body — most likely a connectivity test ping rather
    // than a real Activity. Authentication already succeeded, so
    // acknowledge receipt instead of erroring.
    console.warn("[reo webhook] empty or non-JSON body — treating as a connectivity check");
    return NextResponse.json({ ok: true, received: true, stored: false });
  }

  const signal = normalizeReoSignal(rawPayload);

  if (!signal) {
    // Authenticated but no person identifiable — likely a test/ping payload
    // rather than a real Activity. Acknowledge receipt (2xx) so webhook
    // "test connection" UIs don't read this as broken; still logged for
    // visibility into genuinely malformed real payloads.
    console.warn("[reo webhook] authenticated request had no identifiable person — not stored", rawPayload);
    return NextResponse.json({ ok: true, received: true, stored: false });
  }

  const stored = await insertSignal(signal);

  let rollup;
  try {
    rollup = await rollupSignal(signal, stored.id);
  } catch (err) {
    console.error("rollup failed for signal", stored.id, err);
    rollup = { error: err instanceof Error ? err.message : "unknown rollup error" };
  }

  return NextResponse.json({ ok: true, stored: true, signal: stored, rollup });
}
