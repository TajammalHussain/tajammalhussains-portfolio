// GitHub OAuth proxy for the Sveltia/Decap CMS at /admin/content. The CMS is
// a static, client-side app — it can't hold a GitHub OAuth client secret, so
// it opens this Worker in a popup to do the code-for-token exchange, then
// this Worker hands the token back to the popup's opener via postMessage.
// This is the same protocol Decap CMS's github backend and Sveltia CMS both
// expect from a custom OAuth provider (config.yml's `base_url` points here).
//
// The GitHub OAuth App itself (client ID/secret) has to be created by hand
// in GitHub's settings — that's the part blocked on the repo owner. Once
// created, `wrangler secret put GITHUB_OAUTH_CLIENT_SECRET` and set
// GITHUB_OAUTH_CLIENT_ID in wrangler.toml's [vars].
import type { Env } from "../lib/env";
import { errorJson } from "../lib/http";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const STATE_TTL_SECONDS = 300;

function randomState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function callbackUrl(request: Request): string {
  return new URL("/oauth/callback", request.url).toString();
}

// GET /oauth/authorize — redirects the CMS's popup to GitHub's consent
// screen. The state is a single-use, short-lived nonce stored in KV so the
// callback can confirm this exchange wasn't forged (GitHub echoes it back
// unmodified, but only *we* can tell a valid one from a guessed one).
export async function handleOauthAuthorize(
  env: Env,
  request: Request,
): Promise<Response> {
  if (!env.GITHUB_OAUTH_CLIENT_ID) {
    return errorJson(
      "GitHub OAuth is not configured on this deployment yet",
      503,
    );
  }

  const state = randomState();
  await env.CACHE_KV.put(`oauth:state:${state}`, "1", {
    expirationTtl: STATE_TTL_SECONDS,
  });

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl(request));
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);

  return Response.redirect(authorizeUrl.toString(), 302);
}

// GET /oauth/callback?code=&state= — exchanges the code for an access token
// and hands it to the popup's opener window via the postMessage handshake
// Decap/Sveltia CMS expect: the opener pings "authorizing:github" first
// (proving there's a listener and giving us its origin to target), and only
// then does the popup send the real success/error message.
export async function handleOauthCallback(
  env: Env,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return htmlResponse(
      renderResult({ status: "error", message: "missing code or state" }),
    );
  }

  const stateKey = `oauth:state:${state}`;
  const stateValid = await env.CACHE_KV.get(stateKey);
  if (!stateValid) {
    return htmlResponse(
      renderResult({
        status: "error",
        message: "invalid or expired state — try logging in again",
      }),
    );
  }
  await env.CACHE_KV.delete(stateKey);

  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
    return htmlResponse(
      renderResult({
        status: "error",
        message: "GitHub OAuth is not configured on this deployment yet",
      }),
    );
  }

  try {
    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl(request),
      }),
    });
    const tokenBody = await tokenRes.json<{
      access_token?: string;
      error_description?: string;
    }>();
    if (!tokenBody.access_token) {
      return htmlResponse(
        renderResult({
          status: "error",
          message:
            tokenBody.error_description ??
            "GitHub did not return an access token",
        }),
      );
    }
    return htmlResponse(
      renderResult({ status: "success", token: tokenBody.access_token }),
    );
  } catch (err) {
    return htmlResponse(
      renderResult({
        status: "error",
        message: err instanceof Error ? err.message : "token exchange failed",
      }),
    );
  }
}

function renderResult(
  result:
    { status: "success"; token: string } | { status: "error"; message: string },
): string {
  const payload =
    result.status === "success"
      ? `authorization:github:success:${JSON.stringify({ token: result.token, provider: "github" })}`
      : `authorization:github:error:${JSON.stringify({ message: result.message })}`;

  // Matches the netlify-cms-oauth-provider handshake that both Decap CMS and
  // Sveltia CMS implement: wait for the opener's "authorizing:github" ping
  // (which also tells us its origin — postMessage requires a specific target
  // origin, not "*", once we're sending a real access token) before replying.
  return `<!doctype html>
<html><body>
<script>
  (function() {
    function receiveMessage(message) {
      window.opener.postMessage(
        ${JSON.stringify(payload)},
        message.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:github", "*");
  })();
</script>
</body></html>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
