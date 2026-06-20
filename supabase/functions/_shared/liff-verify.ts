/**
 * LIFF ID Token verification using LINE's public JWKS.
 * LINE signs ID tokens with RS256; we verify against https://api.line.me/oauth2/v2.1/certs
 */
import { createRemoteJWKSet, jwtVerify } from "npm:jose";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Module-level JWKS cache — persists across invocations within the same worker instance
const LINE_JWKS = createRemoteJWKSet(
  new URL("https://api.line.me/oauth2/v2.1/certs"),
);

const VALID_USER_ID = /^U[a-zA-Z0-9]{32}$/;

/**
 * Verify a LIFF ID token.
 * @param idToken - The JWT from liff.getIDToken()
 * @param channelId - LINE Login Channel ID (the numeric part of LIFF ID before the dash)
 * @returns Verified LINE user ID (e.g. "Uxxxxxxxxx"), or null if invalid / expired.
 */
export async function verifyLiffToken(
  idToken: string,
  channelId: string,
): Promise<string | null> {
  if (!idToken || !channelId) return null;
  try {
    const { payload } = await jwtVerify(idToken, LINE_JWKS, {
      issuer:   "https://access.line.me",
      audience: channelId,
    });
    const sub = payload.sub as string | undefined;
    return sub && VALID_USER_ID.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

const SA_ID = /^sa_([0-9a-fA-F-]{36})$/;

export type AuthResult =
  | { userId: string; error?: undefined; status?: undefined }
  | { userId?: undefined; error: string; status: number };

/**
 * Resolve and authenticate the caller's identity from request headers.
 *
 * Identity classes:
 *  - LIFF token present  → verified LINE user id (token is authoritative).
 *  - `sa_<uuid>` (email) → ALWAYS verified against the Supabase session JWT in
 *    the Authorization header; the JWT `sub` must equal `<uuid>`. Closes the
 *    email-impersonation gap with zero breakage (email users always send a JWT).
 *  - `U<32>` without token → can't prove ownership. Rejected only when
 *    `REQUIRE_LINE_TOKEN=true` (set this secret once the LINE token flow is
 *    verified on a real device). Otherwise allowed (legacy/testing tradeoff).
 *  - `dev_*` / `anonymous` → isolated sandbox, no impersonation risk → allowed.
 */
export async function resolveLineUserId(
  req: Request,
  supabase: SupabaseClient,
  channelId: string,
): Promise<AuthResult> {
  const claimed   = req.headers.get("x-line-user-id") ?? "anonymous";
  const liffToken = req.headers.get("x-liff-token");
  const authz     = req.headers.get("authorization") ?? "";

  // 1. LIFF token present → authoritative
  if (liffToken) {
    const verified = await verifyLiffToken(liffToken, channelId);
    if (!verified) return { error: "LIFF token ไม่ถูกต้องหรือหมดอายุ กรุณาเปิดแอปใหม่", status: 401 };
    return { userId: verified };
  }

  // 2. Email user (sa_<uuid>) → must present a matching Supabase session JWT
  const sa = claimed.match(SA_ID);
  if (sa) {
    const token = authz.replace(/^Bearer\s+/i, "");
    if (!token) return { error: "ต้องเข้าสู่ระบบก่อนใช้งาน", status: 401 };
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user || data.user.id !== sa[1]) {
      return { error: "เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status: 401 };
    }
    return { userId: claimed };
  }

  // 3. Real LINE id without a token → can't prove ownership
  if (VALID_USER_ID.test(claimed)) {
    const requireLineToken = (Deno.env.get("REQUIRE_LINE_TOKEN") ?? "false").toLowerCase() === "true";
    if (requireLineToken) return { error: "กรุณาเปิดแอปผ่าน LINE", status: 401 };
    return { userId: claimed };
  }

  // 4. dev_* / anonymous → isolated sandbox
  return { userId: claimed };
}
