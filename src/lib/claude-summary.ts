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

export type SignalForSummary = {
  id: string;
  source: string;
  signalType: string;
  originChannel: string;
  campaign: string | null;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
};

const SIGNAL_SUMMARY_CHUNK_SIZE = 15;

function buildSignalBlocks(signals: SignalForSummary[]): string {
  return signals
    .map(
      (s) => `[[SIGNAL ${s.id}]]
Type: ${s.signalType}
Source: ${s.source}
Channel: ${s.originChannel}
Campaign: ${s.campaign ?? "none"}
Occurred at: ${s.occurredAt}
Raw payload: ${JSON.stringify(s.rawPayload)}`
    )
    .join("\n\n");
}

function parseSignalSummaries(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const blocks = raw.split(/^###\s+/m).filter((b) => b.trim());
  for (const block of blocks) {
    const [idLine, ...rest] = block.split("\n");
    const id = idLine.trim();
    const summary = rest.join("\n").trim();
    if (id && summary) result[id] = summary;
  }
  return result;
}

/**
 * Short (2-3 line) per-signal summaries for the entity detail page's signal
 * list — what this one signal was, who it involved, and any notable
 * enrichment detail from its raw payload. Batched into one Claude call per
 * chunk (rather than one call per signal) for cost/latency; results are
 * cached by the caller (signals.signal_summary) so this only runs once per
 * signal, ever.
 */
export async function generateSignalSummaries(
  signals: SignalForSummary[],
  companyName: string
): Promise<Record<string, string>> {
  if (signals.length === 0) return {};

  if (USE_MOCK_CLAUDE) {
    return Object.fromEntries(
      signals.map((s) => [
        s.id,
        `${s.signalType.replace(/_/g, " ")} via ${s.originChannel}${
          s.campaign ? ` (campaign: ${s.campaign})` : ""
        }. [mock signal summary]`,
      ])
    );
  }

  const result: Record<string, string> = {};
  for (let i = 0; i < signals.length; i += SIGNAL_SUMMARY_CHUNK_SIZE) {
    const chunk = signals.slice(i, i + SIGNAL_SUMMARY_CHUNK_SIZE);
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: Math.min(4096, 150 * chunk.length + 200),
      system:
        `You are a GTM analyst assistant. For EACH signal below (about ${companyName}), write a ` +
        "short 2-3 line plain-language summary of just that one signal — who/what/where, and any " +
        "notable enrichment detail present in its raw payload (job title, page/URL visited, " +
        "campaign, developer or company attributes, etc). Describe only that signal; do not " +
        "compare signals, editorialize about ranking/scoring, or recommend actions.\n\n" +
        "Respond with EXACTLY one block per signal, in this exact format and nothing else:\n" +
        "### <signal id>\n<2-3 line summary>\n\n" +
        "Use the literal id given after [[SIGNAL ...]] as the header. Include a block for every " +
        "signal listed, in the same order given.",
      messages: [{ role: "user", content: buildSignalBlocks(chunk) }],
    });
    Object.assign(result, parseSignalSummaries(extractText(message)));
  }
  return result;
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
