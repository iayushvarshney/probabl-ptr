import type { Message } from "@anthropic-ai/sdk/resources/index";
import { anthropic, CLAUDE_MODEL, USE_MOCK_CLAUDE } from "@/lib/anthropic";
import type { EntityDetail } from "@/lib/entity-detail";
import { RELATIONSHIP_STATE_LABELS } from "@/lib/relationship-state";

function extractText(message: Message): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildContext(detail: EntityDetail): string {
  const company = detail.company.name ?? detail.company.domain ?? "Unknown company";
  const channels = [...new Set(detail.signals.map((s) => s.originChannel))].join(", ") || "unknown";

  const signalLines = detail.signals
    .slice(0, 15)
    .map(
      (s) =>
        `- ${s.signalType} via ${s.originChannel}${s.campaign ? ` (campaign: ${s.campaign})` : ""} — ${s.occurredAt}`
    )
    .join("\n");

  const contactLines = detail.contacts
    .map(
      (c) =>
        `- ${c.fullName ?? c.email ?? "Unknown"}${c.hubspotContactId ? " (known HubSpot contact)" : " (not yet in HubSpot)"}`
    )
    .join("\n");

  return `
Company: ${company}
Relationship state: ${RELATIONSHIP_STATE_LABELS[detail.relationshipState]}
Target account: ${detail.company.isTargetAccount ? "yes" : "no"}
Open deal: ${detail.company.hasOpenOpp ? "yes" : "no"}
Matches ICP: ${detail.company.matchesIcp ? "yes" : "no"}
Composite score: ${detail.compositeScore.toFixed(1)} (reason: ${detail.topReason ?? "n/a"})
Channels involved: ${channels}

Contacts:
${contactLines || "- none yet"}

Signals (most recent first):
${signalLines || "- none"}
`.trim();
}

/**
 * Short plain-language summary of one entity for the detail view: what
 * happened, across which channels, where it came from, why it ranks here.
 * Claude only narrates — the score/reason are computed elsewhere and passed
 * in as fixed facts; it must never be asked to compute or influence them.
 */
export async function generateEntitySummary(detail: EntityDetail): Promise<string> {
  if (USE_MOCK_CLAUDE) {
    const company = detail.company.name ?? detail.company.domain ?? "This account";
    const channels = [...new Set(detail.signals.map((s) => s.originChannel))].join(", ") || "unknown channels";
    return `${company} has ${detail.signals.length} signal(s) via ${channels}. [mock summary]`;
  }

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    system:
      "You are a GTM analyst assistant. Given structured signal and CRM data about one account, " +
      "write a short (2-4 sentence) plain-language summary covering: what happened, across which " +
      "channels, where the interest came from, and why this account ranks where it does. " +
      "Treat the given composite_score and reason as fixed facts — do not recompute, second-guess, " +
      "or imply a different ranking. Do not recommend actions or write outreach copy here.",
    messages: [{ role: "user", content: buildContext(detail) }],
  });

  return extractText(message);
}

export type OutreachDraft = { subject: string; body: string };

/**
 * Secondary, user-triggered feature: a short editable outreach email draft
 * based on the entity's signals. Purely a writing aid — has no bearing on
 * scoring or classification.
 */
export async function generateOutreachDraft(detail: EntityDetail): Promise<OutreachDraft> {
  if (USE_MOCK_CLAUDE) {
    const company = detail.company.name ?? detail.company.domain ?? "there";
    return {
      subject: `Quick question about ${company}`,
      body: `Hi,\n\nNoticed some recent activity from your team and wanted to reach out. [mock outreach draft]\n\nBest,\nProbabl`,
    };
  }

  const primaryContact = detail.contacts.find((c) => c.id === detail.primaryContactId);
  const contactName = primaryContact?.fullName?.split(" ")[0] ?? "there";

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system:
      "You are a sales rep at Probabl (the company behind scikit-learn) drafting a short, " +
      "friendly, low-pressure outreach email based on a lead's recent activity. Reference the " +
      "specific signals naturally, keep it under 120 words, no hard sell, one clear soft CTA. " +
      `Address the recipient as "${contactName}". ` +
      'Respond with EXACTLY: a first line "Subject: ..." followed by the email body on the ' +
      "following lines. No other commentary.",
    messages: [{ role: "user", content: buildContext(detail) }],
  });

  const raw = extractText(message);
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/m);
  const subject = subjectMatch?.[1]?.trim() || "Quick note from Probabl";
  const body = raw.replace(/^Subject:\s*.+$/m, "").trim() || raw;

  return { subject, body };
}
