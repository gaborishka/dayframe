import crypto from "node:crypto";

import type { ApiEnv } from "@dayframe/config";

export function signMediaToken(stripId: string, env: ApiEnv) {
  const expiresAt = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
  const payload = `${stripId}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
  return {
    expiresAt,
    signature
  };
}

export function createSignedStripUrl(stripId: string, env: ApiEnv) {
  const token = signMediaToken(stripId, env);
  const url = new URL(`/media/private/strip/${stripId}`, env.API_BASE_URL);
  url.searchParams.set("exp", String(token.expiresAt));
  url.searchParams.set("sig", token.signature);
  return {
    url: url.toString(),
    expiresAt: new Date(token.expiresAt * 1000).toISOString()
  };
}

export function verifySignedStripUrl(stripId: string, exp: string, sig: string, env: ApiEnv) {
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const payload = `${stripId}.${expiresAt}`;
  const expected = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
