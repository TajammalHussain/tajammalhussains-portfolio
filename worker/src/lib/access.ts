// Cloudflare Access (Zero Trust) JWT verification for /api/admin/* routes.
//
// Cloudflare Access sits in front of the Worker at the edge: once a user
// completes SSO, Access sets a `CF_Authorization` cookie (and also forwards
// the same value as a header on proxied requests) containing a signed JWT.
// Verifying it here — rather than trusting Access blindly — means the app
// still enforces auth even if it's ever reachable by a path that bypasses
// the Access policy, and gives us the caller's email for the audit log.
//
// No passwords or session state live in this app: identity is entirely
// Access's SSO session, and this function only *verifies*, never issues.
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

export interface AccessIdentity {
  email: string;
}

// The JWKS is small and rotates rarely; a module-level cache avoids a fetch
// to Cloudflare on every single admin request within the same isolate.
let jwksCache: {
  teamDomain: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJwks(teamDomain: string) {
  if (jwksCache?.teamDomain === teamDomain) return jwksCache.jwks;
  const jwks = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
  );
  jwksCache = { teamDomain, jwks };
  return jwks;
}

/**
 * Verifies the CF_Authorization JWT on an incoming request. Returns the
 * caller's identity on success, or null if the token is missing, malformed,
 * expired, or fails signature/audience verification — callers should treat
 * null as "reject with 401", never as "allow through".
 *
 * Local dev exception: when ENVIRONMENT is "development" and no Access team
 * domain is configured (the normal state for `wrangler dev` on a laptop with
 * no Cloudflare Access set up), verification is skipped and a fixed dev
 * identity is returned. This only activates when CF_ACCESS_TEAM_DOMAIN is
 * genuinely unset — the moment real Access secrets are configured (even in a
 * "development" environment), full verification applies.
 */
export async function verifyAccess(
  request: Request,
  env: Env,
): Promise<AccessIdentity | null> {
  if (env.ENVIRONMENT === "development" && !env.CF_ACCESS_TEAM_DOMAIN) {
    return { email: "dev@localhost" };
  }

  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    return null; // Access isn't configured — fail closed, never fail open.
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    parseCookie(request.headers.get("Cookie"), "CF_Authorization");
  if (!token) return null;

  try {
    const jwks = getJwks(env.CF_ACCESS_TEAM_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`,
      audience: env.CF_ACCESS_AUD,
    });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
