# CLAUDE.md — Probabl Ptr build brief (Friday MVP)

You are building **Probabl Ptr**, an internal GTM signal-intelligence tool for Probabl (the company behind scikit-learn). Read this whole file before writing code. Follow the build order at the bottom. Ask me before making irreversible choices; otherwise proceed.

## What this tool is (one paragraph)
An internal, password-gated web app that ingests GTM buying signals from multiple sources (PostHog product/ad signals, Reo.dev developer-intent signals), resolves each signal to a **person + company**, cross-references it against **HubSpot** (is this contact/company known? a target account? open deal?), scores and ranks it with a **deterministic scoring model**, and presents a **morning prioritized queue** answering: *"Who do I contact today, in what priority, and why?"* Claude (the API) writes a plain-language summary and optional outreach draft per entity — but does NOT do the scoring.

## Why it exists (do not lose this)
Reo already pushes some signals into HubSpot as tasks. This tool's value is NOT "get signals into HubSpot" — it's the **intelligence layer on top**: merging multi-source signals onto one entity, tagging relationship state, and prioritizing. If it just re-pushes raw signals, it has failed.

## The MVP scope (Friday) — build EXACTLY this, nothing more
1. **Ingestion**: working webhook endpoints for PostHog and Reo, normalizing into a common `IncomingSignal` shape and storing every signal in Supabase.
2. **Cross-reference**: for each signal, resolve person+company and look them up directly in HubSpot (Contact by email → Company by domain → open-deal check → target-account boolean property).
3. **Rollup**: accumulate multiple signals onto one Account + its Contacts (an "entity"), not disconnected rows.
4. **Scoring**: deterministic composite score per entity, weights in ONE config file.
5. **Morning queue UI**: ranked list of entities, score + one-line reason + origin channel visible, filterable by relationship state. THIS IS THE PRODUCT — make it good.
6. **Detail view**: per entity — all signals, HubSpot context, Claude summary, edit fields, "Push to HubSpot (Task)" and "Dismiss".
7. **Claude summary** per entity (+ an optional "Draft outreach" button — secondary).
8. **Deploy to Vercel** and register live webhooks.

### NOT in the Friday MVP (do not build — these are documented Phase 2)
- Outbound account discovery ("hot ICP accounts not on our radar")
- LinkedIn Sales Nav / TeamLink warm-intro lookup (leave a stub/placeholder only)
- ICP settings page (hardcode a simple ICP check for now, behind one function so it's swappable)
- Multi-user auth (single shared password only)

## Relationship-state model (the core classification)
Every entity is classified into ONE state, with flags layered on:
- `NET_NEW_CONTACT_NET_NEW_COMPANY` — nobody on our radar
- `NEW_CONTACT_KNOWN_COMPANY` — **new person at a company we already work (HIGHEST VALUE — Stephen's key case)**
- `KNOWN_CONTACT_KNOWN_COMPANY` — already in conversation
Flags (booleans, independent of state): `is_target_account`, `has_open_opp`, `matches_icp`.

## Scoring model (deterministic — Claude API must NOT compute this)
`composite_score = relationship_weight * signal_intensity_sum * target_multiplier`
- `relationship_weight`: NEW_CONTACT_KNOWN_COMPANY = 3.0, KNOWN_CONTACT_KNOWN_COMPANY = 2.0, NET_NEW_* = 1.0 (×1.5 more only if matches_icp)
- `signal_intensity_sum`: sum of each signal's weight × recency decay
  - weights: product_signup 40, ad_signup 40, webinar_attended 30, github_star 25, repeat_ad_engagement 20, key_page_view 15, webinar_registered 15, ad_click 12, repeat_visit 10, linkedin_follow 8, generic_page_view 5
  - recency decay: ≤7d ×1.0, 8–30d ×0.5, >30d ×0.2
- `target_multiplier`: 1.5 if is_target_account else 1.0
ALL of these live in `src/lib/scoring.config.ts` as exported constants. Nothing hardcoded elsewhere.

## IncomingSignal shape (the normalization contract)
```ts
type IncomingSignal = {
  source: 'reo' | 'posthog';
  signal_type: 'product_signup' | 'ad_signup' | 'ad_click' | 'repeat_ad_engagement'
    | 'github_star' | 'key_page_view' | 'repeat_visit' | 'generic_page_view'
    | 'webinar_registered' | 'webinar_attended' | 'linkedin_follow';
  origin_channel: 'paid_ad' | 'linkedin' | 'organic' | 'webinar' | 'github' | 'unknown';
  campaign?: string;              // UTM / campaign / creative when present
  raw_payload: Record<string, unknown>;
  person_identifier: string;      // email preferred; else name+company
  company_domain?: string;
  occurred_at: string;            // ISO8601
};
```
Adding a source later = one new mapping function to this shape. Keep the core pipeline source-agnostic.

## Tech stack (do not deviate)
- **Next.js** (App Router, TypeScript) — webhook API routes + frontend, one app
- **Supabase** (Postgres) — use the `@supabase/supabase-js` client; schema provided in `supabase-schema.sql` (run it in the Supabase SQL editor)
- **HubSpot** — Private App token via REST API (`/crm/v3/...`); NOT OAuth
- **Claude API** — `@anthropic-ai/sdk`, model `claude-sonnet-4-6`, for summary + outreach ONLY
- **Auth** — single shared password via Next.js middleware + a signed, HttpOnly session cookie
- **Styling** — Tailwind. Probabl brand: Persian Blue `#1E22AA` (primary), Sea Buckthorn `#F68D2E` (accent, primary buttons only), Inter font. Clean, dense, dashboard-like.
- **Hosting** — Vercel

## HubSpot specifics (verified — don't re-learn)
- Notes/Task engagement APIs run under standard Contacts/Companies scopes — there is NO separate engagement scope to add in the Private App scope picker.
- Engagement→target associations use DIFFERENT association type IDs per target type (contact vs company vs deal). Look them up via the associations API; do NOT hardcode a guessed ID.
- Create tasks via `POST /crm/v3/objects/tasks`, then associate to the Contact/Company/(Deal if present).
- The target-account flag is a boolean company property — confirm its exact internal name via the HubSpot properties API at runtime (log it once); do not guess the label.
- Push creates a **Task, not a Deal** (deliberate — not every signal is an opportunity).

## Mock flags (fallback, not default — I have real keys)
Support `USE_MOCK_HUBSPOT` and `USE_MOCK_CLAUDE` env booleans. When true, the respective integration returns canned data so the UI and pipeline can run without the live call. Default both to `false`. This lets a blocked call never stall a build step.

## Identity resolution
Build `resolveIdentity(signal)` returning `{ person, company, confidence }`. Match by email → company_domain → fuzzy name+company. Low-confidence matches must be flagged in the UI, never silently merged. This is the highest-leverage correctness work — invest here.

## Build order (do these in sequence; commit after each)
1. Scaffold Next.js (App Router, TS, Tailwind). Add env template, install deps, set up Supabase client + Anthropic SDK + a HubSpot REST wrapper.
2. Run `supabase-schema.sql` in Supabase; generate/confirm types.
3. Implement `IncomingSignal` type + normalizers for PostHog and Reo. Add `/api/webhook/posthog` and `/api/webhook/reo` routes that normalize + store.
4. `resolveIdentity()` + HubSpot lookup (contact/company/open-deal/target-account) + entity rollup writing to the entities/links tables.
5. `scoring.config.ts` + scoring function; compute + store composite score per entity.
6. Morning queue UI: ranked entity list, filter by relationship state, score + reason + channel. Make this genuinely good.
7. Entity detail view: signals + HubSpot context + Claude summary; edit fields; Push-to-HubSpot-Task; Dismiss.
8. Claude summary call (+ optional Draft-outreach button).
9. Password middleware + session cookie.
10. Deploy to Vercel. Then register live webhooks (PostHog self-serve; Reo needs Customer Success to enable, then Admin configures Settings → Integrations → Webhooks with **Activities** payload type).

## Definition of done for Friday
A deployed URL where: a real PostHog signup webhook (or a seeded signal) shows up as a ranked entity in the morning queue, correctly classified by relationship state, with a Claude summary, and I can push it to HubSpot as a Task. Everything else is polish.
