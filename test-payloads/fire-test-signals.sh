#!/usr/bin/env bash
# Fires one test signal per relationship state at /api/webhook/test, so the
# morning queue has something to show right away.
#
# Usage:
#   ./test-payloads/fire-test-signals.sh
#   BASE_URL=https://your-deploy.vercel.app ./test-payloads/fire-test-signals.sh
#
# Reads POSTHOG_WEBHOOK_SECRET from .env.local by default (matches your
# normal `npm run dev`) — override by exporting POSTHOG_WEBHOOK_SECRET
# yourself before running.
#
# NOTE on relationship states: whether a signal lands as
# NEW_CONTACT_KNOWN_COMPANY / KNOWN_CONTACT_KNOWN_COMPANY vs net-new depends
# on whether that company/contact actually exists in HubSpot.
#   - USE_MOCK_HUBSPOT=true: the domains below (containing "known" /
#     "target" / "deal") deterministically produce all three states — see
#     the mock fixtures in src/lib/hubspot.ts.
#   - USE_MOCK_HUBSPOT=false (the default — real HubSpot): everything below
#     will land as NET_NEW unless you edit the domains/emails to match real
#     records in your HubSpot.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${POSTHOG_WEBHOOK_SECRET:-$(grep '^POSTHOG_WEBHOOK_SECRET=' "$PROJECT_ROOT/.env.local" 2>/dev/null | cut -d= -f2)}"

if [ -z "$SECRET" ]; then
  echo "No webhook secret found. Set POSTHOG_WEBHOOK_SECRET in .env.local, or export it before running this script." >&2
  exit 1
fi

fire() {
  local label="$1"
  local payload="$2"
  echo "--- $label ---"
  curl -s -X POST "$BASE_URL/api/webhook/test" \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: $SECRET" \
    -d "$payload"
  echo
  echo
}

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

fire "NET_NEW_CONTACT_NET_NEW_COMPANY (fresh signup, unknown company)" \
  "{\"source\":\"posthog\",\"signal_type\":\"product_signup\",\"origin_channel\":\"organic\",\"person_identifier\":\"alex@brandnewleadco.com\",\"company_domain\":\"brandnewleadco.com\",\"occurred_at\":\"$NOW\"}"

fire "NEW_CONTACT_KNOWN_COMPANY (target account + open deal, new person)" \
  "{\"source\":\"posthog\",\"signal_type\":\"key_page_view\",\"origin_channel\":\"paid_ad\",\"person_identifier\":\"newperson@known-target-deal.com\",\"company_domain\":\"known-target-deal.com\",\"occurred_at\":\"$NOW\"}"

fire "KNOWN_CONTACT_KNOWN_COMPANY (known contact at known company)" \
  "{\"source\":\"posthog\",\"signal_type\":\"repeat_visit\",\"origin_channel\":\"organic\",\"person_identifier\":\"known-person@known-corp.com\",\"company_domain\":\"known-corp.com\",\"occurred_at\":\"$NOW\"}"

echo "Done — check $BASE_URL (log in first if the password gate is on)."
