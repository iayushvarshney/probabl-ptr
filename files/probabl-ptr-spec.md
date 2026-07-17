# Probabl Ptr — "GTM Palantir"
## Build spec / CLAUDE.md brief

An **intelligence layer** over Probabl's GTM signals. It merges inbound + outbound signals from Reo.dev and PostHog into one platform, cross-references each against HubSpot **and LinkedIn Sales Navigator (for warm-intro paths)**, scores and prioritizes them, and answers one question every morning: **"Who do I contact today, in what priority, with what context?"**

Fresh build; reuses the patterns and hard-won learnings from Ptr v1 (see "Inherited learnings"), not the v1 codebase.

Target: **basic MVP by Friday** (per the review meeting).

---

## 0. Why this tool exists (state this up front — your manager already challenged it)

In the review, Stephen pointed out that **Reo already pushes two segments (LinkedIn activity + GitHub activity) into HubSpot as tasks**. So the tool's reason to exist is **not** "get signals into HubSpot" — that already happens. Its job is the **intelligence layer on top**:

- **Merge** signals from multiple tools into one view instead of scattered Reo/PostHog/HubSpot tasks.
- **Cross-reference** each signal against HubSpot relationship state *and* against Sales Navigator for warm-intro routes.
- **Prioritize** so someone opening this in the morning instantly sees who matters most and why.
- **Contextualize** — where did this person come from (ad, LinkedIn, signup), are they net-new or known, is their company a target/open-opp.

If the tool just re-pushes what Reo already pushes, it has failed. The value is being *smarter* than the raw sync. Lead the demo with this.

---

## 1. What changed from v1

| | Ptr v1 (old) | Ptr v2 (this build) |
|---|---|---|
| Purpose | Review one signal → create a HubSpot task | **Merge, cross-reference, prioritize** — a morning "who to contact" engine |
| Sources | Reo + PostHog | Reo + PostHog (**+ ad/UTM source attribution**) |
| LinkedIn | — | **Enrichment lookup for warm intros (TeamLink), NOT a signal source** |
| Output | Task-per-signal card | **Prioritized morning queue + exploration dashboard + optional draft outreach** |
| Prioritization | Claude per-signal (high/med/low) | **Deterministic scoring model** (explainable, tunable) |
| Unit of work | Individual signal | **Account + contact rollup** — signals are evidence accumulating on entities |

---

## 2. LinkedIn Sales Navigator — corrected role (important)

The meeting notes made LinkedIn look like a third signal source. The transcript is clearer: Stephen wants to **cross-reference against Sales Nav to find warm-intro paths** ("from where we can get the warm intro to the person"). That's a **TeamLink** capability — a UI feature, not a signal feed.

So LinkedIn is an **enrichment lookup**, not an ingestion source:
- For a prioritized contact, answer: *is there a warm intro path, and through which Probabl teammate?*
- LinkedIn has **no public Sales Nav signal API**; SNAP is partner-gated, TeamLink is UI-only. So this lookup is either **manual (link out to the Sales Nav search for that person)** or, at best, a periodic CSV mapping of team connections. Do NOT architect LinkedIn as a real-time webhook — it isn't one.
- MVP-honest version: for each contact, generate a **deep link into Sales Nav / TeamLink** for that person so the admin can see intro paths in one click, and flag "warm intro likely available" where a CSV connection map supports it (you already rolled out TeamLink Extend to 49 employees — that CSV is the raw material).

This keeps the promise honest and shippable by Friday.

---

## 3. The prioritization model

Stephen described the categories twice, precisely. They collapse into **two independent axes** — modeling them separately is the single biggest improvement over the flat list, because it lets "net-new person who just signed up" outrank "known account with a stale ad click."

**Axis A — Relationship state** (Stephen's exact taxonomy):
- `NET_NEW_CONTACT_NET_NEW_COMPANY` — nobody/nothing on our radar
- `NET_NEW_CONTACT_KNOWN_COMPANY` — new person at a company we're already talking to (his Gabriel Muñoz / Chronopost example)
- `KNOWN_CONTACT_KNOWN_COMPANY` — person + company both already in play
- Flags layered on top: `IS_TARGET_ACCOUNT`, `HAS_OPEN_OPP`, `MATCHES_ICP` (for net-new companies — "heads up, this new account fits our ICP")

**Axis B — Signal intensity** (weight × recency decay). Weights live in `scoring.config.ts`:
- Product signup (PostHog) → 40 (strongest)
- Ad-driven signup → 40 (attributed click→signup is as strong as any signup, plus known channel)
- Webinar *attended* → 30 / *registered* only → 15
- GitHub star/fork, repeated dev activity (Reo) → 20–30
- Repeat ad engagement (multi-campaign) → 20
- Key-page view (pricing / cert / IP landing) → 15 / generic page → 5
- Single ad click → 10–15
- Repeat website visit → 10
- LinkedIn follow → 5–10
- (Tier 2/3 signals get weights when wired: email reply > email click; job-change at target account → high)
- Recency: full weight ≤7d, ×0.5 at 8–30d, ×0.2 beyond

**Composite** = `relationship_weight × signal_intensity_sum × target_multiplier`
- `target_multiplier` = 1.5 if flagged HubSpot target account (reuse v1's confirmed boolean property), else 1.0.
- All weights live in **one `scoring.config.ts`** — Stephen will retune these once he sees real data. Do not scatter them.

The queue should be **filterable by Axis-A category**, because Stephen explicitly wants to slice "target accounts doing things" vs. "net-new ICP accounts we haven't touched."

---

## 4. Source attribution ("where did they come from") — first-class requirement

Stephen singled this out: the summary should say *"this person clicked your advertising"* / *"this person followed on LinkedIn"* / *"signed up."* This ties directly to your existing PostHog UTM / LinkedIn attribution work.

- Capture and surface the **origin channel** on every signal: paid ad (with UTM/campaign), LinkedIn, organic signup, webinar, etc.
- **Open item you owe Stephen:** blog-post interactions are **not currently tracked** in GA (only the website is). He asked you to check whether blog/asset engagement can be tracked. Note this as a data-gap — the tool can only attribute sources it actually receives. Flag it in the demo rather than silently omitting blog signals.

---

## 5. Signal catalogue & ingestion

A "GTM Palantir" is defined by **breadth of integrated signals**, not any one feed. The value is fusing many weak signals into one strong picture of a person/account. Below is the full landscape, tiered by lift. **Tier 1 is wired for the Friday MVP (broadly); Tiers 2–3 are the documented expansion roadmap.**

The `IncomingSignal` normalization (below) is what makes breadth cheap: each new signal is a small mapping function + a weight in `scoring.config.ts`, never a rebuild.

### Tier 1 — plumbing already exists, wire now

| Signal | Source | Notes |
|---|---|---|
| **Paid ad click → landing** | PostHog UTM + LinkedIn `li_fat_id`/GTM | Attribution already deployed. Carry campaign/creative as metadata. |
| **Ad-driven signup** | PostHog + LinkedIn Conversions API | Click attributed all the way to Skore signup — pipeline already built. Strong signal. |
| **Repeat ad engagement** | PostHog | Same person, multiple campaigns = rising intent. Stronger than a single click. |
| **Product signup (Skore)** | PostHog webhook | Strongest inbound intent. Self-serve webhook — do first. |
| **GitHub star / fork / dev activity** | Reo.dev webhook | "Activities" payload for instant events. |
| **Key-page views** | PostHog / website tracking | Pricing, Skolar cert page, IP/scikit-learn landing page. High-intent pages weight higher than a generic visit. |
| **Repeat / return visits** | PostHog | Back 3× this week ≠ one-time visitor. |
| **Webinar registration + attendance** | Livestorm | *Attended* > *registered-but-no-show*. You've done this data work repeatedly. |

**Paid ads decompose into three distinct signals** — click, ad-driven signup, repeat engagement — each with its own weight, all carrying UTM + campaign so Claude's summary can say *which* campaign resonated (feeds the "what message" part of Stephen's ask).

### Tier 2 — data exists, needs a connection (roadmap)

| Signal | Source | Notes |
|---|---|---|
| **Email clicks / replies** | HubSpot / Lemlist | Opens are noisy; clicks + replies are real intent. |
| **Content / asset downloads** | HubSpot forms | Gated cert materials, whitepapers. |
| **Blog / docs engagement** | ⚠️ needs tracking setup | **The gap Stephen flagged** — not in GA today. Add *because* he asked; requires instrumentation first. |
| **LinkedIn post / profile engagement** | Sales Nav (manual/export) | UI-only, same caveat as warm intros (§2). |

### Tier 3 — higher-value, more lift (roadmap)

| Signal | Source | Notes |
|---|---|---|
| **Job change / new hire at target account** | Reo / enrichment | New DS/ML leader at a CAC40 account = classic buying trigger. Ties to your CAC40/SBF120 headcount work. |
| **Hiring signals** | Job-board enrichment | Company posting scikit-learn/ML-platform roles = investing in the space. |
| **Funding / news events** | Enrichment feed | Fresh funding at an ICP account. |
| **Technographic change** | Enrichment | Adopting/dropping a competing tool. |
| **Event / community signals** | Manual (Brella, VivaTech scans) | Physical-event intent — the attendee lists you already collect. |

### Ingestion mechanics (Tier 1)

**PostHog** — webhook, self-serve (Data pipeline → Destinations → + New → Webhook → filter to event). Fastest to wire; do first. Carries UTM/source for §4 and covers ad click, signup, page views, repeat visits.

**Reo.dev** — webhook, **"Activities" payload type** for instant per-event signals (Account/Developer payloads refresh only every 24h). Not self-serve: Reo Customer Success must enable, then Admin configures under Settings → Integrations → Webhooks. Needs a deployed URL.
- Redundancy note (§0): Reo already syncs two segments to HubSpot. Recommend Ptr ingests Reo **directly via webhook** so it owns the normalized signal and isn't downstream of Reo's task formatting.

**Livestorm** — check current export/webhook path (you've diagnosed the Livestorm→HubSpot sync before). If no clean webhook, a periodic CSV/API pull of registrants+attendance into the normalizer is fine for MVP.

**LinkedIn Conversions API / ad platforms** — feed ad-attribution signals via the PostHog pipeline you already built rather than a separate integration.

### Normalization (reuse from v1, extended)
```
IncomingSignal {
  source            // 'reo' | 'posthog' | 'livestorm' | ...
  signal_type       // 'product_signup' | 'github_star' | 'ad_click' |
                    // 'ad_signup' | 'page_view' | 'repeat_visit' |
                    // 'webinar_registered' | 'webinar_attended' | ...
  origin_channel    // 'paid_ad' | 'linkedin' | 'organic' | 'webinar' | 'github' | ... (§4)
  campaign          // UTM / campaign / creative, when present
  raw_payload       // original JSON, verbatim
  person_identifier // email | name+company
  company_domain
  occurred_at
}
```
Every Tier 1/2/3 signal maps to this shape. That uniformity is the whole reason breadth stays cheap.

---

## 6. Cross-referencing & entity rollup (the core logic)

v1 looked up one signal. v2 **resolves signals to entities and accumulates**:

1. Resolve each signal to a **person** + **company** (identity resolution).
2. HubSpot lookup, direct each time (Contact by email → Company by domain → open-deal check → target-account boolean). Do **not** rely on the native Reo↔HubSpot sync — deliberate v1 requirement, keep it.
3. **Sales Nav / TeamLink enrichment** (§2): warm-intro path lookup for the person.
4. Roll multiple signals onto one **Account + its Contacts**, so the queue shows *"Chronopost — new contact Gabriel Muñoz, GitHub star 2d ago, existing target account with open workshop eval"* rather than a bare signal row. (This is literally Stephen's worked example — build to it.)
5. Compute the composite score (§3) at entity level.

Identity resolution is the hard part. Build `resolveIdentity()` with a confidence output; low-confidence matches get flagged in the UI, not silently merged.

---

## 7. Claude's role (deliberately narrow)

Claude does **not** score — the deterministic model does, so ranking is reproducible and Stephen can trust/tune it. Claude does:
- **Summarize** each prioritized entity: what happened, across which channels, relationship context, and **where they came from** (§4) — in Stephen's words, *"this person clicked your advertising… here's a potential draft outreach."*
- **Draft outreach** — **on demand, secondary priority.** Stephen framed this as "ideal world" / "potentially." Build the button; don't make it the centerpiece. The morning prioritization is the product.

---

## 8. Output surfaces

1. **Morning prioritized queue** *(the product)* — ranked accounts/contacts, score + one-line reason + origin channel + warm-intro flag, filterable by Axis-A category. This is what Stephen wants people to open first thing: "who do I call today." Optimize this view above all.
2. **Exploration dashboard** — the "GTM Palantir" browse view: search/filter all signals + entities, drill into an account for every signal, contact, HubSpot context, and intro path.
3. **Action** — per entity: Claude summary, optional generate-outreach, push to HubSpot **Task** (associated to Contact/Company/Deal — reuse v1's Task-not-Deal decision + association-type-ID learnings), or dismiss.

---

## 9. Tech stack (reuse v1 patterns)

- **Next.js** (App Router, TS) — webhook routes + frontend, one app.
- **Supabase** (Postgres) — signals table + **new entities layer** (accounts, contacts, signal→entity links, scores, intro-paths). This schema is the main net-new design.
- **HubSpot API** — Private App token, direct lookups.
- **Claude API** — summary + optional outreach only.
- **Auth** — single shared password + signed session cookie (single admin; fine again).
- **Hosting** — **deploy to Vercel FIRST.** v1's real gap was never deploying, so webhooks couldn't reach it. Nothing is live without a public URL.
- **Repo** — new `probabl-ptr`, via Claude Code.
- **Mock flags** — reuse `USE_MOCK_CLAUDE` / `USE_MOCK_HUBSPOT` so a blocked scope never stalls the build.

---

## 10. Inherited learnings (don't re-learn)

- HubSpot Notes/Task engagement APIs run under standard Contacts/Companies scopes — no separate engagement scope in the Private App picker.
- Engagement→target associations use **different association type IDs** per target type (contact vs company vs deal) — look them up, don't hardcode.
- Webhooks cannot reach `localhost` — deploy first.
- Confirm HubSpot property internal names in settings — don't guess.
- Build behind mock flags when an access dependency blocks a step.

---

## 11. Branding

Persian Blue `#1E22AA` primary, Sea Buckthorn `#F68D2E` accent (primary action buttons only), Inter typeface. Apply the Probabl branding skill to UI work.

---

## 12. Build order (to hit Friday MVP)

1. Supabase schema: signals + entities + links + scores + intro-paths.
2. Normalizer + `IncomingSignal` shape (port from v1, add `origin_channel` + `campaign`).
3. **PostHog webhook first** (self-serve; covers signup, ad click/signup, page views, repeat visits in one integration) → then Reo webhook → Livestorm pull.
4. Identity resolution + HubSpot cross-reference + entity rollup. **Spend disproportionate effort here** — with a broad signal set, fusing "same person across ad + GitHub + webinar" is the whole Palantir value.
5. Scoring model (`scoring.config.ts`) with the full Tier 1 weight table.
6. **Morning prioritized queue** (build this well — it's the product) → exploration dashboard → entity detail.
7. Sales Nav / TeamLink warm-intro lookup (deep-link version for MVP).
8. Claude summary (+ optional outreach button).
9. Push-to-HubSpot Task + dismiss.
10. **Deploy to Vercel**, register live webhooks (PostHog self-serve; Reo via Customer Success).

MVP-by-Friday cut line: steps 1–6 + 8 + deploy, with as many **Tier 1** signals wired through PostHog as land cleanly (PostHog carries most of them in one integration, so "broad" is realistic here). Reo, Livestorm, warm-intro lookup (7), and outreach drafting slot in as they're ready — none block the core queue demo. Tiers 2–3 stay documented, not built.

---

## 13. ICP configuration (settings page — applies to both inbound scoring and Phase 2 discovery)

ICP is **config, not hardcode.** Add a settings page where the admin defines and edits the ICP over time. This is what lets Ptr's `MATCHES_ICP` flag (§3) and Phase 2 discovery (§14) share one source of truth, and it means Stephen can retune without a code change.

ICP definition should capture, at minimum:
- **Firmographics** — industry/sector (your existing focus: Finance, Life Sciences; France + US), company size / DS-team headcount bands, geography.
- **Technographics** — uses Python / scikit-learn / ML tooling; developer-team presence.
- **Fit weights** — how much each attribute contributes to an ICP-fit score (mirrors the tunable pattern of `scoring.config.ts`).

Store as a versioned config row in Supabase (keep history — "ICP as of date X" matters when Stephen retunes and wants to compare). Reuse the definition behind your existing 150-company Reo ICP-scored list as the seed values, but the page is the authority going forward, not that list.

---

## 14. Phase 2 — Outbound account discovery ("who's NOT on our radar yet")

**Documented now, built after the inbound MVP ships.** This is the half Stephen described at the end of the review: *"heads up, these are new accounts we have not interacted with that fit our ICP… here are their latest signals."* It's also the evolution of your hackathon PipeWork concept.

**Critical distinction from inbound:** inbound reacts to signals from people/accounts *already touching us*. Discovery scans the outside world for **companies matching the ICP config (§13) that are showing intent AND are not already in the HubSpot target-account list.** The **dedup against HubSpot target accounts is the defining feature** — the output is specifically "net-new to us." Reuse the same direct-HubSpot-lookup pattern (§6) to filter these out.

### Discovery signal sources (recommended tooling)

| Source | Have it? | Role in discovery |
|---|---|---|
| **Reo.dev account-level intent** | ✅ already | **Backbone.** Use the account/developer payloads (24h refresh) — built for "which companies show intent." No new tool. |
| **GitHub activity on scikit-learn + Probabl repos** | ✅ (GitHub Signal Watcher built before) | Stargazers/forkers/contributors → resolve to companies. **Overlaps heavily with Reo** — only build direct GitHub watching for what Reo misses; don't duplicate. |
| **Clay** | Already in proposed stack | **The one tool worth adding.** Orchestrates enrichment + third-party intent + hiring/funding in one layer, and can dedup against HubSpot. Collapses 3 of the 4 sources into one integration — avoids a new procurement conversation. |
| **Hiring / funding / news (trigger events)** | Via Clay | Company hiring scikit-learn/ML/DS-infra roles, or fresh funding = budget + intent. Pull through Clay rather than a standalone vendor. On-demand Claude+web-search enrichment for a shortlist is a lightweight alternative for news. |

**Tooling recommendation:** don't integrate five new vendors. **Reo (have it) + GitHub (have it) + Clay (already planned)** covers all four signal types the manager wants. Clay is the only addition, and it's already in your consolidation proposal. Steer away from a brand-new standalone intent vendor (Bombora/Apollo-style) unless Reo+GitHub prove to under-cover non-developer buyers.

### Discovery flow
1. Pull candidate companies showing intent (Reo account intent + GitHub + Clay-orchestrated intent/hiring/funding).
2. Score each against the **ICP config (§13)** → ICP-fit score.
3. **Dedup against HubSpot target-account list** → keep only net-new companies.
4. Present as a ranked "**Hot ICP accounts not yet on our radar**" list, each with its latest signals + why it fits the ICP (Claude summary), and a one-click "add to HubSpot as target account / create task."
5. Same normalized `IncomingSignal` + entity model as inbound — discovery is a *new source of entities*, not a separate system. This is why the inbound schema must stay source-agnostic.

### Phase 3 (Stephen also floated this)
Once discovery data accumulates: **derive/refine the ICP from who actually converts** — feed the settings page (§13) suggested ICP attributes based on which discovered/inbound accounts became MQLs/SQLs. Closes the loop between §13 and §14. Note to Stephen you heard this; don't build it yet.

---

## Open items to confirm / owe Stephen
- **Blog/asset tracking gap** — you owe him a check on whether blog-post interactions can be tracked (currently GA only tracks the website). The tool can only attribute channels it receives.
- **Reo redundancy decision** — ingest Reo directly (recommended) vs. read Reo's existing HubSpot tasks. Be ready to explain why Ptr isn't just duplicating the existing sync.
- **Scoring weights** — §3 constants are a defensible start; retune with him on real data.
- **Phase 2 discovery + Clay** — confirm Clay is going into the stack (it's in your consolidation proposal); it's the recommended single addition that powers discovery. Discovery itself is Phase 2, after the inbound Friday MVP.
- **ICP ownership** — the §13 settings page makes ICP Stephen-editable; seed it from the existing 150-company Reo scored list, then let the page be the authority.
