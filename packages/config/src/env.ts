import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const userPreferencesSchema = z.object({
  comic_style: z.string().default("adventure"),
  tone: z.string().default("humorous"),
  language: z.string().default("en")
});

const sharedSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  API_BASE_URL: z.url().default("http://localhost:4000"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  DAY_CONTEXT_TTL_HOURS: z.coerce.number().int().positive().default(24),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.string().default("disable"),
  SESSION_COOKIE_NAME: z.string().default("dayframe_session")
});

const apiSchema = sharedSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ALLOWED_ORIGIN: z.url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.url().default("http://localhost:4000/auth/callback"),
  GOOGLE_SCOPES: z.string().default(
    "openid,email,profile,https://www.googleapis.com/auth/calendar.readonly,https://www.googleapis.com/auth/tasks.readonly"
  ),
  DO_SPACES_BUCKET: z.string().default(""),
  DO_SPACES_REGION: z.string().default(""),
  DO_SPACES_ENDPOINT: z.string().default(""),
  DO_SPACES_CDN_BASE_URL: z.string().default(""),
  DO_ACCESS_KEY_ID: z.string().default(""),
  DO_SECRET_ACCESS_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-2.0-flash-preview-image-generation"),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  PRIVATE_MODEL_BASE_URL: z.url().default("http://10.0.0.10:8000"),
  PRIVATE_MODEL_API_KEY: z.string().default(""),
  PRIVATE_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  PRIVATE_MODEL_MODE: z.string().default("non-thinking")
});

const workerSchema = sharedSchema.extend({
  WORKER_ID: z.string().default("worker-local-1"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  JOB_LEASE_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  JOB_HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  JOB_RECOVERY_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  PANEL_RENDER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  WEEKLY_COMPILATION_SWEEP_CRON: z.string().default("*/15 * * * *")
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;

export const defaultUserPreferences = userPreferencesSchema.parse({});

function findWorkspaceRoot(startDir = __dirname): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }

  return startDir;
}

function loadEnvFile(fromDir = process.cwd()) {
  const workspaceRoot = findWorkspaceRoot(fromDir);
  const localEnv = path.join(workspaceRoot, ".env");
  const exampleEnv = path.join(workspaceRoot, ".env.example");
  const envPath = fs.existsSync(localEnv) ? localEnv : exampleEnv;
  dotenv.config({ path: envPath });
  return { envPath, workspaceRoot };
}

export function loadApiEnv(fromDir = process.cwd()): ApiEnv {
  loadEnvFile(fromDir);
  return apiSchema.parse(process.env);
}

export function loadWorkerEnv(fromDir = process.cwd()): WorkerEnv {
  loadEnvFile(fromDir);
  return workerSchema.parse(process.env);
}

export function resolveWorkspacePath(...segments: string[]) {
  const { workspaceRoot } = loadEnvFile();
  return path.join(workspaceRoot, ...segments);
}
