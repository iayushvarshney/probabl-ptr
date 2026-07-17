import { NextResponse } from "next/server";
import { rollupSignal } from "@/lib/rollup";
import { insertSignal } from "@/lib/signals";
import type { IncomingSignal, SignalSource } from "@/lib/types";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

// Lets you POST an IncomingSignal-shaped body directly (skipping the
// PostHog/Reo-specific normalizers) to exercise the rest of the pipeline.
// Gated by the same shared secret as the real source it's impersonating, so
// it can't be used to inject fake signals once deployed.
const WEBHOOK_SECRETS: Record<SignalSource, string | undefined> = {
  posthog: process.env.POSTHOG_WEBHOOK_SECRET,
  reo: process.env.REO_WEBHOOK_SECRET,
};

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<IncomingSignal>;
  const source: SignalSource = body.source ?? "posthog";

  if (!isAuthorizedWebhook(request, WEBHOOK_SECRETS[source])) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!body.person_identifier) {
    return NextResponse.json(
      { error: "person_identifier is required" },
      { status: 400 }
    );
  }

  const signal: IncomingSignal = {
    source,
    signal_type: body.signal_type ?? "generic_page_view",
    origin_channel: body.origin_channel ?? "unknown",
    campaign: body.campaign,
    raw_payload: body.raw_payload ?? (body as Record<string, unknown>),
    person_identifier: body.person_identifier,
    company_domain: body.company_domain,
    occurred_at: body.occurred_at ?? new Date().toISOString(),
  };

  const stored = await insertSignal(signal);

  let rollup;
  try {
    rollup = await rollupSignal(signal, stored.id);
  } catch (err) {
    console.error("rollup failed for signal", stored.id, err);
    rollup = { error: err instanceof Error ? err.message : "unknown rollup error" };
  }

  return NextResponse.json({ ok: true, signal: stored, rollup });
}
