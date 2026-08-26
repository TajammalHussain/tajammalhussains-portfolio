import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { handleOauthAuthorize, handleOauthCallback } from "../src/routes/oauth";

// In this test env GITHUB_OAUTH_CLIENT_ID/SECRET are unset (no real GitHub
// OAuth App exists yet — that's the part blocked on the repo owner). Tests
// that need those vars set call the handlers directly with a mock env
// (mutating the imported `env` object doesn't propagate to SELF.fetch's own
// isolate — same reason lib/access.test.ts unit-tests verifyAccess directly
// rather than through SELF.fetch).

describe("GET /oauth/authorize", () => {
  it("reports 503 honestly when no GitHub OAuth App is configured yet", async () => {
    const res = await SELF.fetch("https://example.com/oauth/authorize");
    expect(res.status).toBe(503);
  });

  it("redirects to GitHub with a state param once a client id is configured", async () => {
    const configuredEnv = { ...env, GITHUB_OAUTH_CLIENT_ID: "test-client-id" };
    const res = await handleOauthAuthorize(
      configuredEnv,
      new Request("https://example.com/oauth/authorize"),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin).toBe("https://github.com");
    expect(location.pathname).toBe("/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://example.com/oauth/callback",
    );
    expect(location.searchParams.get("scope")).toBe("repo");
    expect(location.searchParams.get("state")).toBeTruthy();
  });
});

describe("GET /oauth/callback", () => {
  it("returns an error postMessage payload when code/state are missing", async () => {
    const res = await SELF.fetch("https://example.com/oauth/callback");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("authorization:github:error");
    expect(body).toContain("missing code or state");
  });

  it("rejects a state that was never issued (forged or replayed)", async () => {
    const res = await SELF.fetch(
      "https://example.com/oauth/callback?code=abc&state=not-a-real-state",
    );
    const body = await res.text();
    expect(body).toContain("authorization:github:error");
    expect(body).toContain("invalid or expired state");
  });

  it("accepts a genuinely issued state exactly once, then rejects reuse", async () => {
    const configuredEnv = { ...env, GITHUB_OAUTH_CLIENT_ID: "test-client-id" };

    const authRes = await handleOauthAuthorize(
      configuredEnv,
      new Request("https://example.com/oauth/authorize"),
    );
    const state = new URL(authRes.headers.get("Location")!).searchParams.get(
      "state",
    )!;

    // No GITHUB_OAUTH_CLIENT_SECRET is set, so the token exchange itself
    // can't succeed here — but the state should be consumed (single-use)
    // regardless of what happens after, and the error should reflect the
    // *next* failure (missing secret), not a stale-state error.
    const firstCallback = await handleOauthCallback(
      configuredEnv,
      new Request(`https://example.com/oauth/callback?code=abc&state=${state}`),
    );
    const firstBody = await firstCallback.text();
    expect(firstBody).toContain("authorization:github:error");
    expect(firstBody).toContain("not configured");

    const secondCallback = await handleOauthCallback(
      configuredEnv,
      new Request(`https://example.com/oauth/callback?code=abc&state=${state}`),
    );
    const secondBody = await secondCallback.text();
    expect(secondBody).toContain("invalid or expired state");
  });

  it("includes the postMessage handshake script regardless of outcome", async () => {
    const res = await SELF.fetch("https://example.com/oauth/callback");
    const body = await res.text();
    expect(body).toContain('window.opener.postMessage("authorizing:github"');
    expect(body).toContain('addEventListener("message"');
  });
});

describe("oauth routes bypass admin auth and rate limiting", () => {
  it("does not require an Access identity (it's the login flow itself)", async () => {
    const res = await SELF.fetch("https://example.com/oauth/callback");
    expect(res.status).not.toBe(401);
  });
});
