import crypto from "node:crypto";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ApiEnv } from "@dayframe/config";

import { concreteUrl } from "../lib/urls.js";

function isSpacesConfigured(env: ApiEnv) {
  return Boolean(
    env.DO_SPACES_BUCKET &&
      env.DO_SPACES_ENDPOINT &&
      env.DO_ACCESS_KEY_ID &&
      env.DO_SECRET_ACCESS_KEY &&
      !env.DO_ACCESS_KEY_ID.includes("your-digitalocean-access-key")
  );
}

let cachedSpacesClient: S3Client | null = null;

function getSpacesClient(env: ApiEnv) {
  if (!cachedSpacesClient) {
    cachedSpacesClient = new S3Client({
      region: env.DO_SPACES_REGION,
      endpoint: env.DO_SPACES_ENDPOINT,
      forcePathStyle: false,
      credentials: {
        accessKeyId: env.DO_ACCESS_KEY_ID,
        secretAccessKey: env.DO_SECRET_ACCESS_KEY
      }
    });
  }

  return cachedSpacesClient;
}

export function signMediaToken(stripId: string, env: ApiEnv) {
  const expiresAt = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
  const payload = `${stripId}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
  return {
    expiresAt,
    signature
  };
}

export function createLocalSignedStripUrl(stripId: string, env: ApiEnv, baseUrl?: string) {
  const token = signMediaToken(stripId, env);
  const origin = concreteUrl(baseUrl) ?? concreteUrl(env.API_BASE_URL) ?? "http://localhost:4000";
  const url = new URL(`/media/private/strip/${stripId}`, origin);
  url.searchParams.set("exp", String(token.expiresAt));
  url.searchParams.set("sig", token.signature);
  return {
    url: url.toString(),
    expiresAt: new Date(token.expiresAt * 1000).toISOString()
  };
}

export async function uploadPrivateStripAsset(userId: string, date: string, svg: string, env: ApiEnv) {
  const assetPath = `users/${userId}/strips/${date}/strip.svg`;
  if (!isSpacesConfigured(env)) {
    return { assetPath, publicUrl: null };
  }

  const client = getSpacesClient(env);
  await client.send(
    new PutObjectCommand({
      Bucket: env.DO_SPACES_BUCKET,
      Key: assetPath,
      Body: svg,
      ContentType: "image/svg+xml"
    })
  );

  return { assetPath, publicUrl: null };
}

export async function createSignedStripUrl(stripId: string, assetPath: string | null, env: ApiEnv, baseUrl?: string) {
  if (!assetPath || !isSpacesConfigured(env)) {
    return createLocalSignedStripUrl(stripId, env, baseUrl);
  }

  const client = getSpacesClient(env);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.DO_SPACES_BUCKET,
      Key: assetPath
    }),
    { expiresIn: env.SIGNED_URL_TTL_SECONDS }
  );

  return {
    url,
    expiresAt: new Date(Date.now() + env.SIGNED_URL_TTL_SECONDS * 1000).toISOString()
  };
}

export async function publishPublicShareArtifact(shareId: string, svg: string, env: ApiEnv, baseUrl?: string) {
  const assetPath = `public/shares/${shareId}/strip.svg`;

  if (!isSpacesConfigured(env)) {
    const origin = concreteUrl(baseUrl) ?? concreteUrl(env.API_BASE_URL) ?? "http://localhost:4000";
    return {
      assetPath,
      publicUrl: `${origin}/public/shares/${shareId}/strip.svg`
    };
  }

  const client = getSpacesClient(env);
  await client.send(
    new PutObjectCommand({
      Bucket: env.DO_SPACES_BUCKET,
      Key: assetPath,
      Body: svg,
      ContentType: "image/svg+xml",
      ACL: "public-read"
    })
  );

  const base = env.DO_SPACES_CDN_BASE_URL || `${env.DO_SPACES_ENDPOINT.replace("https://", `https://${env.DO_SPACES_BUCKET}.`)}`;
  return {
    assetPath,
    publicUrl: `${base}/${assetPath}`
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
