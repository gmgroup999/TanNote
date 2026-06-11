/**
 * LIFF ID Token verification using LINE's public JWKS.
 * LINE signs ID tokens with RS256; we verify against https://api.line.me/oauth2/v2.1/certs
 */
import { createRemoteJWKSet, jwtVerify } from "npm:jose";

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
