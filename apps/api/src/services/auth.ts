import crypto from "node:crypto";
import { TextEncoder } from "node:util";

import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";

import { defaultUserPreferences, type ApiEnv } from "@dayframe/config";

import { getDb, users } from "../db/index.js";

type SessionPayload = {
  sub: string;
  email: string;
};

type GoogleTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

export type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
    displayName: string;
    preferences: typeof defaultUserPreferences;
  };
};

function signingKey(secret: string) {
  return new TextEncoder().encode(secret);
}

function encryptionKey(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

export async function signSessionCookie(payload: SessionPayload, env: ApiEnv) {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(signingKey(env.JWT_SECRET));
}

export async function verifySessionCookie(token: string, env: ApiEnv) {
  const verified = await jwtVerify(token, signingKey(env.JWT_SECRET));
  return {
    userId: verified.payload.sub as string,
    email: verified.payload.email as string
  };
}

export function setSessionCookie(response: Response, token: string, env: ApiEnv) {
  response.cookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSessionCookie(response: Response, env: ApiEnv) {
  response.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/"
  });
}

export function encryptSecret(value: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSecret(value: string, secret: string) {
  const payload = Buffer.from(value, "base64url");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function hasRealGoogleOAuth(env: ApiEnv) {
  return (
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    !env.GOOGLE_CLIENT_ID.includes("your-google-client-id") &&
    !env.GOOGLE_CLIENT_SECRET.includes("your-google-client-secret")
  );
}

export function buildGoogleAuthUrl(env: ApiEnv) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_CALLBACK_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", env.GOOGLE_SCOPES.split(",").join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", crypto.randomUUID());
  return url.toString();
}

async function exchangeGoogleCode(code: string, env: ApiEnv): Promise<GoogleTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  }

  return (await response.json()) as GoogleTokens;
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("GOOGLE_PROFILE_FETCH_FAILED");
  }

  return (await response.json()) as { email: string; name?: string };
}

export async function authenticateFromCallback(code: string | undefined, env: ApiEnv) {
  const db = getDb();

  if (code && hasRealGoogleOAuth(env)) {
    const tokens = await exchangeGoogleCode(code, env);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const encryptedAccess = encryptSecret(tokens.access_token, env.JWT_SECRET);
    const encryptedRefresh = tokens.refresh_token ? encryptSecret(tokens.refresh_token, env.JWT_SECRET) : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const existing = await db.query.users.findFirst({
      where: eq(users.email, profile.email)
    });

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          displayName: profile.name ?? existing.displayName,
          googleAccessToken: encryptedAccess,
          googleRefreshToken: encryptedRefresh ?? existing.googleRefreshToken,
          googleTokenExpiresAt: expiresAt,
          preferences: existing.preferences
        })
        .where(eq(users.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        displayName: profile.name ?? profile.email.split("@")[0]!,
        googleAccessToken: encryptedAccess,
        googleRefreshToken: encryptedRefresh,
        googleTokenExpiresAt: expiresAt,
        preferences: defaultUserPreferences
      })
      .returning();

    return created;
  }

  const demoEmail = "demo@dayframe.local";
  const existing = await db.query.users.findFirst({
    where: eq(users.email, demoEmail)
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: demoEmail,
      displayName: "DayFrame Demo",
      preferences: defaultUserPreferences
    })
    .returning();

  return created;
}

export async function requireAuth(env: ApiEnv, request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token) {
      response.status(401).json({ error: "Authentication required.", code: "UNAUTHORIZED" });
      return;
    }

    const verified = await verifySessionCookie(token, env);
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, verified.userId), eq(users.email, verified.email))
    });

    if (!user) {
      clearSessionCookie(response, env);
      response.status(401).json({ error: "Authentication required.", code: "UNAUTHORIZED" });
      return;
    }

    (request as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      preferences: user.preferences
    };

    next();
  } catch {
    clearSessionCookie(response, env);
    response.status(401).json({ error: "Authentication required.", code: "UNAUTHORIZED" });
  }
}
