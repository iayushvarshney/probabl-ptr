// Shared-secret check for webhook routes. Accepts the secret via an
// `x-webhook-secret` header, a `Bearer` Authorization header, or a `secret`
// query param — whichever is easiest to configure on the sending platform's
// webhook settings.
export function isAuthorizedWebhook(
  request: Request,
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret) return false;

  const headerSecret = request.headers.get("x-webhook-secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;
  const querySecret = new URL(request.url).searchParams.get("secret");

  const provided = headerSecret ?? bearerSecret ?? querySecret;
  return provided === expectedSecret;
}
