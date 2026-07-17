# Probabl Ptr

Internal GTM signal-intelligence tool for Probabl. Ingests buying signals from
PostHog and Reo.dev, cross-references them against HubSpot, scores and ranks
them deterministically, and presents a prioritized morning queue of who to
contact today and why.

See `CLAUDE.md` for the full product brief and scoring model.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in real values (see
   [Environment variables](#environment-variables) below).
3. Run the Supabase schema once, in the Supabase SQL editor for your project:
   `supabase-schema.sql`.
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). You'll be redirected
   to `/login` — enter `NAV_SHARED_PASSWORD`.

### Seeding test signals

`test-payloads/fire-test-signals.sh` posts one signal per relationship state
to `/api/webhook/test` (a dev-only shortcut that skips the PostHog/Reo
normalizers). Requires `POSTHOG_WEBHOOK_SECRET` to be set in `.env.local`:

```bash
./test-payloads/fire-test-signals.sh
# or against a deployed URL:
BASE_URL=https://your-deploy.vercel.app ./test-payloads/fire-test-signals.sh
```

With `USE_MOCK_HUBSPOT=false` (the default), everything will land as
`NET_NEW_CONTACT_NET_NEW_COMPANY` unless the test domains/emails happen to
match real HubSpot records. Set `USE_MOCK_HUBSPOT=true` to deterministically
exercise all three relationship states instead.

## Environment variables

All required variables are documented in `.env.example`. Summary:

| Variable | Used by | Exposed to client? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client | Yes — not a secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase client (server-only) | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | declared, currently unused | Yes — not a secret |
| `HUBSPOT_PRIVATE_APP_TOKEN` | HubSpot REST wrapper | No |
| `HUBSPOT_TARGET_ACCOUNT_PROPERTY` | optional override if the target-account property can't be auto-detected | No |
| `ANTHROPIC_API_KEY` | Claude summary/outreach | No |
| `CLAUDE_MODEL` | Claude summary/outreach | No |
| `NAV_SHARED_PASSWORD` | login page | No |
| `NAV_SESSION_SECRET` | signs the session cookie | No |
| `POSTHOG_WEBHOOK_SECRET` | verifies PostHog webhook | No |
| `REO_WEBHOOK_SECRET` | verifies Reo webhook | No |
| `USE_MOCK_HUBSPOT` / `USE_MOCK_CLAUDE` | bypass live calls for dev | No |

All secret-holding variables are read only in API route handlers, Server
Components/Actions, and `src/lib/*` modules that client components reach
only via `import type` (erased at compile time) — none of them ship in the
client JS bundle.

## Deploying to Vercel

1. Push this repo to GitHub (or use `vercel` CLI to deploy directly without
   git) and import it in the [Vercel dashboard](https://vercel.com/new).
2. In the project's **Settings → Environment Variables**, add every variable
   from `.env.example` with real production values — a fresh
   `NAV_SESSION_SECRET` and `POSTHOG_WEBHOOK_SECRET`/`REO_WEBHOOK_SECRET` are
   fine to generate new for production rather than reusing local dev values.
3. Deploy. Note the resulting URL (e.g. `https://probabl-ptr.vercel.app`).
4. Visit the deployed URL once and log in with `NAV_SHARED_PASSWORD` to
   confirm the auth gate and queue page work.

### Registering the live webhooks

Once deployed, the webhook endpoints are:

```
https://<your-deployment-domain>/api/webhook/posthog
https://<your-deployment-domain>/api/webhook/reo
```

**PostHog** (self-serve):
1. In PostHog, go to **Data pipeline → Destinations** (or **Project Settings
   → Webhooks**, depending on your PostHog version) and add a new webhook
   destination pointed at `/api/webhook/posthog` above.
2. Add a custom header `x-webhook-secret: <your POSTHOG_WEBHOOK_SECRET>` (or
   append `?secret=<...>` to the URL, or send it as a `Bearer` token in the
   `Authorization` header — the route accepts any of the three).
3. Send a test event and confirm it shows up as a new entity in the queue.

**Reo.dev** (needs Customer Success to enable first):
1. Ask Reo Customer Success to enable webhooks for your account.
2. Once enabled, as Admin: **Settings → Integrations → Webhooks**, add a
   webhook pointed at `/api/webhook/reo` above, with payload type
   **Activities**.
3. Add the shared secret the same way as PostHog (header, query param, or
   Bearer token — see `src/lib/webhook-auth.ts`).

Webhook routes are exempt from the app's password gate (they authenticate
via their own shared secret, checked in `src/lib/webhook-auth.ts`) — see
`src/proxy.ts` for the exemption.

## Definition of done

A real PostHog signup webhook (or a seeded signal via
`fire-test-signals.sh`) shows up as a ranked entity in the morning queue,
correctly classified by relationship state, with a Claude summary — and it
can be pushed to HubSpot as a Task.
