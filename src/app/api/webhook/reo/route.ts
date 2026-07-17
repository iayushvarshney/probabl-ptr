import { NextResponse } from "next/server";
import { normalizeReoSignal } from "@/lib/normalizers/reo";
import { rollupSignal } from "@/lib/rollup";
import { insertSignal } from "@/lib/signals";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

export async function POST(request: Request) {
  if (!isAuthorizedWebhook(request, process.env.REO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawPayload = (await request.json()) as Record<string, unknown>;
  const signal = normalizeReoSignal(rawPayload);

  if (!signal) {
    return NextResponse.json(
      { error: "could not resolve a person identifier from payload" },
      { status: 422 }
    );
  }

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
