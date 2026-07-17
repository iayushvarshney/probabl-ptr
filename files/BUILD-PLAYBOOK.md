# How to build this with Claude Code — Friday session playbook

You have `CLAUDE.md` (the brief), `supabase-schema.sql`, and `.env.example`.
Don't paste one giant prompt. Drive Claude Code in the steps below — each is a
natural commit point. Let it finish and test a step before moving on.

## Setup (you, before starting Claude Code)
1. `mkdir probabl-ptr && cd probabl-ptr`
2. Drop `CLAUDE.md`, `supabase-schema.sql`, and `.env.example` into the folder.
3. `cp .env.example .env.local` and fill in your real keys.
4. In the Supabase SQL editor, paste + run `supabase-schema.sql`.
5. Start Claude Code in this folder: `claude`.

## Prompt 1 — scaffold
> Read CLAUDE.md fully. Then scaffold the Next.js App Router + TypeScript + Tailwind
> project in this directory. Install @supabase/supabase-js, @anthropic-ai/sdk. Set up:
> a server-side Supabase client (service role key), an Anthropic client, and a thin
> HubSpot REST wrapper module with functions I'll fill in next. Add the Inter font and
> Tailwind config with the Probabl brand colors as named tokens (persian-blue #1E22AA,
> sea-buckthorn #F68D2E). Confirm it builds and runs before continuing.

## Prompt 2 — types + normalizers + webhooks
> Implement the IncomingSignal type exactly as specified in CLAUDE.md. Write two
> normalizer functions (PostHog and Reo) that map raw payloads to IncomingSignal, and
> two API routes /api/webhook/posthog and /api/webhook/reo that verify the shared
> secret, normalize, and insert into the signals table. For now, if you're unsure of
> the exact Reo/PostHog payload fields, normalize defensively and store the full raw
> payload in raw_payload. Add a /api/webhook/test route I can POST a fake signal to.

## Prompt 3 — identity resolution + HubSpot cross-reference + rollup
> Implement resolveIdentity(signal) returning { person, company, confidence } per
> CLAUDE.md. Then implement the HubSpot lookups in the wrapper: find contact by email,
> company by domain, check for an open deal, and read the target-account boolean company
> property (confirm its internal name at runtime via the properties API and log it).
> Then write the rollup: upsert companies + contacts, classify relationship_state, set
> the flags, link signals to an entity row. Respect USE_MOCK_HUBSPOT.

## Prompt 4 — scoring
> Create src/lib/scoring.config.ts with all weights/decay/multipliers from CLAUDE.md as
> exported constants. Implement the scoring function and a recompute step that runs after
> rollup, writing composite_score + a human-readable top_reason onto the entity.

## Prompt 5 — the morning queue (spend time here)
> Build the morning queue page as the app's home. Ranked list of entities by
> composite_score desc, status=pending. Each row: company name, relationship_state badge,
> score, top_reason, origin channel(s), target/open-opp/ICP flags, last_signal_at. A
> filter control for relationship_state and for target-account-only. This is the product
> — make it dense, fast, and genuinely nice to scan. Use the brand colors: persian-blue
> for structure, sea-buckthorn ONLY for the primary action.

## Prompt 6 — entity detail + actions
> Build the entity detail view: all signals (type, channel, time, raw), the HubSpot
> context, the Claude summary area, and editable fields (task subject, body, due date,
> assignee). Two actions: "Push to HubSpot" (creates a Task via /crm/v3/objects/tasks,
> associates to contact/company/deal using looked-up association type IDs, records a row
> in pushes, sets entity status=pushed) and "Dismiss" (status=dismissed). Idempotent push.

## Prompt 7 — Claude summary + outreach
> Add the Claude call (model from CLAUDE_MODEL) that takes an entity's signals + HubSpot
> context and returns a short structured summary: what happened, across which channels,
> where they came from, why it ranks here. Store in claude_summary. Add a secondary
> "Draft outreach" button that generates an editable email draft. Claude must NOT compute
> or influence the score. Respect USE_MOCK_CLAUDE.

## Prompt 8 — auth
> Add Next.js middleware gating the whole app behind NAV_SHARED_PASSWORD with a signed,
> HttpOnly session cookie (secret = NAV_SESSION_SECRET). A simple /login page. Webhook
> routes must be EXEMPT from the password gate (they use their own shared-secret check).

## Prompt 9 — deploy
> Prepare for Vercel: verify all env vars are read server-side only where needed, add a
> README with the deploy steps and the exact webhook URLs to register. Then I'll deploy
> and register the live webhooks (PostHog self-serve; Reo via Customer Success →
> Activities payload type).

## Guardrails to repeat to Claude Code if it drifts
- "Scoring is deterministic in scoring.config.ts. Claude never scores."
- "Task, not Deal, on push."
- "Don't build Phase 2 (discovery, ICP settings page, LinkedIn warm-intro) — stub only."
- "Keep the core pipeline source-agnostic — new sources are just new normalizers."

## Friday demo acceptance test
POST a signup-shaped signal to /api/webhook/test (or trigger a real PostHog signup) →
it appears in the morning queue, correctly classified and scored, with a Claude summary
→ open it → push to HubSpot as a Task → confirm the task exists in HubSpot. If that full
loop works on the deployed URL, the MVP is done.
