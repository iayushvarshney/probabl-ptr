import { NextResponse } from "next/server";
import { normalizeReoDeveloperMembership } from "@/lib/normalizers/reo-developer";
import { upsertCompany, upsertContact } from "@/lib/rollup";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

// Reachability check — see the sibling /activity route for why GET/HEAD
// always return 200 here.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

// Reo's "Developer" payload is a developer-added-to-segment MEMBERSHIP
// event, not a timestamped activity (no activity_type/activity_date/
// activity_source_url). It must NOT become a scored entity/queue row —
// this quietly upserts the company + contact so a later Activity signal
// from this same person resolves cleanly and arrives pre-enriched.
export async function POST(request: Request) {
  if (!isAuthorizedWebhook(request, process.env.REO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = (await request.json()) as Record<string, unknown>;
  } catch {
    console.warn(
      "[reo developer webhook] empty or non-JSON body — treating as a connectivity check"
    );
    return NextResponse.json({ ok: true, received: true, stored: false });
  }

  const membership = normalizeReoDeveloperMembership(rawPayload);
  if (!membership) {
    console.warn(
      "[reo developer webhook] authenticated request had no identifiable company/person — not stored",
      rawPayload
    );
    return NextResponse.json({ ok: true, received: true, stored: false });
  }

  const company = await upsertCompany({
    domain: membership.company.domain,
    name: membership.company.name,
    customerFit: membership.company.customerFit,
    activityScore: membership.company.activityScore,
    activityScoreNumeric: membership.company.activityScoreNumeric,
    industry: membership.company.industry,
    employeeCountRange: membership.company.employeeCountRange,
    preferredTechnology: membership.company.preferredTechnology,
    developerFunnel: membership.company.developerFunnel,
  });

  const contact = await upsertContact({
    email: membership.contact.email,
    fullName: membership.contact.fullName,
    companyId: company.id,
    linkedinUrl: membership.contact.linkedinUrl,
    title: membership.contact.title,
    rawDeveloperPayload: rawPayload,
  });

  return NextResponse.json({ ok: true, stored: true, company, contact });
}
