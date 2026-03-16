import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { defaultUserPreferences, loadApiEnv } from "@dayframe/config";
import { assertSchema } from "@dayframe/contracts";

import { comicStrips, getDb, shareLinks, users } from "./db/index.js";
import { concreteUrl } from "./lib/urls.js";
import {
  authenticateFromCallback,
  buildGoogleAuthUrl,
  hasRealGoogleOAuth,
  requireAuth,
  setSessionCookie,
  signSessionCookie
} from "./services/auth.js";
import {
  buildJobStatusResponse,
  createOrReuseGenerationJob,
  createShareLink,
  getDayContextForUser,
  getLatestStripForUserDate,
  getStripReadModelForUserDate,
  getUserMe,
  listStripsForRange,
  mapDailyContextResponse,
  mapGenerationJob,
  upsertDayContextForUser
} from "./services/jobs.js";
import { verifySignedStripUrl } from "./services/storage.js";
import { getWeeklyIssueReadModel, listTornPageReadModels, listWeeklyIssueReadModels, unlockTornPage } from "./services/weekly.js";

const contextSchema = z.object({
  manual_todos: z.array(
    z.object({
      text: z.string().trim().min(1),
      completed: z.boolean()
    })
  ),
  reflection: z.string().max(1000).nullable()
});

const preferenceSchema = z.object({
  comic_style: z.string().min(1).optional(),
  tone: z.string().min(1).optional(),
  language: z.string().min(1).optional()
});

const env = loadApiEnv(import.meta.dirname);

function requestBaseUrl(request: express.Request) {
  const forwardedProto = request.headers["x-forwarded-proto"]?.toString().split(",")[0]?.trim();
  const forwardedHost = request.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim();
  const protocol = forwardedProto || request.protocol;
  const host = forwardedHost || request.get("host") || "localhost";
  return `${protocol}://${host}`;
}

function resolveAppBaseUrl(request: express.Request) {
  return concreteUrl(env.APP_BASE_URL) ?? requestBaseUrl(request);
}

function resolveApiBaseUrl(request: express.Request) {
  return concreteUrl(env.API_BASE_URL) ?? requestBaseUrl(request);
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: concreteUrl(env.CORS_ALLOWED_ORIGIN) ?? true,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/auth/google", (request, response) => {
    if (!hasRealGoogleOAuth(env)) {
      response.redirect(302, `${resolveApiBaseUrl(request)}/auth/callback?state=dev-scaffold`);
      return;
    }

    response.redirect(302, buildGoogleAuthUrl(env));
  });

  app.get("/auth/callback", async (request, response) => {
    try {
      const user = await authenticateFromCallback(
        typeof request.query.code === "string" ? request.query.code : undefined,
        env
      );
      const token = await signSessionCookie({ sub: user.id, email: user.email }, env);
      setSessionCookie(response, token, env);
      response.redirect(302, resolveAppBaseUrl(request));
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Authentication failed.",
        code: "AUTH_CALLBACK_FAILED"
      });
    }
  });

  app.get("/media/private/strip/:stripId", async (request, response) => {
    const { stripId } = request.params;
    const exp = String(request.query.exp ?? "");
    const sig = String(request.query.sig ?? "");

    if (!verifySignedStripUrl(stripId, exp, sig, env)) {
      response.status(401).json({ error: "Signed media URL has expired or is invalid.", code: "INVALID_SIGNED_URL" });
      return;
    }

    const strip = await getDb().query.comicStrips.findFirst({
      where: eq(comicStrips.id, stripId)
    });

    if (!strip) {
      response.status(404).json({ error: "Strip not found.", code: "STRIP_NOT_FOUND" });
      return;
    }

    response.setHeader("content-type", "image/svg+xml");
    response.send(strip.composedSvg);
  });

  app.get("/s/:shareId", async (request, response) => {
    const share = await getDb().query.shareLinks.findFirst({
      where: and(eq(shareLinks.shareId, request.params.shareId), eq(shareLinks.isActive, true))
    });

    if (!share) {
      response.status(404).json({ error: "Share not found.", code: "SHARE_NOT_FOUND" });
      return;
    }

    const strip = await getDb().query.comicStrips.findFirst({
      where: eq(comicStrips.id, share.comicStripId)
    });

    if (!strip) {
      response.status(404).json({ error: "Share not found.", code: "SHARE_NOT_FOUND" });
      return;
    }

    response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${strip.title}</title>
    <style>
      body { margin: 0; font-family: Georgia, serif; background: #f3ede1; color: #1f2937; }
      main { max-width: 1100px; margin: 0 auto; padding: 40px 20px 64px; }
      .frame { background: white; border-radius: 24px; padding: 16px; box-shadow: 0 20px 60px rgba(17, 24, 39, 0.15); }
      img { width: 100%; display: block; }
    </style>
  </head>
  <body>
    <main>
      <h1>${strip.title}</h1>
      <div class="frame">
        <img src="${share.publicAssetUrl ?? `${resolveApiBaseUrl(request)}/public/shares/${share.shareId}/strip.svg`}" alt="${strip.title}" />
      </div>
    </main>
  </body>
</html>`);
  });

  app.get("/public/shares/:shareId/strip.svg", async (request, response) => {
    const share = await getDb().query.shareLinks.findFirst({
      where: and(eq(shareLinks.shareId, request.params.shareId), eq(shareLinks.isActive, true))
    });

    if (!share) {
      response.status(404).json({ error: "Share not found.", code: "SHARE_NOT_FOUND" });
      return;
    }

    const strip = await getDb().query.comicStrips.findFirst({
      where: eq(comicStrips.id, share.comicStripId)
    });

    if (!strip) {
      response.status(404).json({ error: "Share not found.", code: "SHARE_NOT_FOUND" });
      return;
    }

    response.setHeader("content-type", "image/svg+xml");
    response.send(strip.composedSvg);
  });

  app.use("/api", (request, response, next) => requireAuth(env, request, response, next));

  app.get("/api/user/me", async (request, response) => {
    const user = await getUserMe((request as any).user.id);
    response.json(user);
  });

  app.patch("/api/user/preferences", async (request, response) => {
    const parsed = preferenceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({ error: "Unsupported preference value.", code: "INVALID_PREFERENCES" });
      return;
    }

    const userId = (request as any).user.id as string;
    const existing = await getDb().query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!existing) {
      response.status(401).json({ error: "Authentication required.", code: "UNAUTHORIZED" });
      return;
    }

    const [updated] = await getDb()
      .update(users)
      .set({
        preferences: {
          ...defaultUserPreferences,
          ...existing.preferences,
          ...parsed.data
        }
      })
      .where(eq(users.id, userId))
      .returning();

    response.json({
      id: updated.id,
      preferences: updated.preferences
    });
  });

  app.put("/api/day/:date/context", async (request, response) => {
    const parsed = contextSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid daily input payload.", code: "INVALID_CONTEXT_PAYLOAD" });
      return;
    }

    try {
      const timezone = request.headers["x-dayframe-timezone"]?.toString() || "Europe/Uzhgorod";
      const record = await upsertDayContextForUser((request as any).user.id, request.params.date, timezone, parsed.data, env);
      const payload = mapDailyContextResponse(record);
      assertSchema("dailyContextResponse", payload);
      response.json(payload);
    } catch {
      response.status(400).json({ error: "Invalid daily input payload.", code: "INVALID_CONTEXT_PAYLOAD" });
    }
  });

  app.get("/api/day/:date/context", async (request, response) => {
    const record = await getDayContextForUser((request as any).user.id, request.params.date);
    if (!record) {
      response.status(404).json({ error: "No saved context for this date.", code: "DAY_CONTEXT_NOT_FOUND" });
      return;
    }

    const payload = mapDailyContextResponse(record);
    assertSchema("dailyContextResponse", payload);
    response.json(payload);
  });

  app.post("/api/day/:date/generate", async (request, response) => {
    const context = await getDayContextForUser((request as any).user.id, request.params.date);
    const hasUsableInput =
      Boolean(context?.reflection?.trim()) || Boolean(context && context.todoItems.length > 0) || Boolean(context && context.calendarEvents.length > 0);

    if (!hasUsableInput) {
      response.status(422).json({ error: "No usable daily context is available for generation.", code: "NO_INPUT_CONTEXT" });
      return;
    }

    const result = await createOrReuseGenerationJob((request as any).user.id, request.params.date);
    response.status(result.created ? 201 : 200).json({
      job: mapGenerationJob(result.job)
    });
  });

  app.get("/api/day/:date/status", async (request, response) => {
    const payload = await buildJobStatusResponse((request as any).user.id, request.params.date, env);
    if (!payload) {
      response.status(404).json({ error: "No generation job or strip exists for this date.", code: "STATUS_NOT_FOUND" });
      return;
    }

    assertSchema("jobStatusResponse", payload);
    response.json(payload);
  });

  app.get("/api/strips/:date", async (request, response) => {
    const strip = await getStripReadModelForUserDate((request as any).user.id, request.params.date, env, requestBaseUrl(request));
    if (!strip) {
      response.status(404).json({ error: "No strip exists for this date.", code: "STRIP_NOT_FOUND" });
      return;
    }

    response.json(strip);
  });

  app.get("/api/strips", async (request, response) => {
    const query = z
      .object({
        from: z.string().date(),
        to: z.string().date()
      })
      .safeParse(request.query);

    if (!query.success) {
      response.status(400).json({ error: "Invalid strip range.", code: "INVALID_RANGE" });
      return;
    }

    const strips = await listStripsForRange((request as any).user.id, query.data.from, query.data.to, env, requestBaseUrl(request));
    response.json(strips);
  });

  app.get("/api/issues/:isoWeek", async (request, response) => {
    const issue = await getWeeklyIssueReadModel((request as any).user.id, request.params.isoWeek, env, requestBaseUrl(request));
    if (!issue) {
      response.status(404).json({ error: "No weekly issue exists for the requested ISO week.", code: "ISSUE_NOT_FOUND" });
      return;
    }

    response.json(issue);
  });

  app.get("/api/issues", async (request, response) => {
    const issues = await listWeeklyIssueReadModels((request as any).user.id, env, requestBaseUrl(request));
    response.json(issues.filter(Boolean));
  });

  app.get("/api/torn-pages", async (request, response) => {
    response.json(await listTornPageReadModels((request as any).user.id));
  });

  app.post("/api/torn-pages/:id/unlock", async (request, response) => {
    const body = z
      .object({
        response_text: z.string().min(1)
      })
      .safeParse(request.body);

    if (!body.success) {
      response.status(422).json({ error: "This torn page is not eligible for unlock.", code: "TORN_PAGE_NOT_UNLOCKABLE" });
      return;
    }

    const result = await unlockTornPage((request as any).user.id, request.params.id, body.data.response_text, env);
    if (!result) {
      response.status(422).json({ error: "This torn page is not eligible for unlock.", code: "TORN_PAGE_NOT_UNLOCKABLE" });
      return;
    }

    response.status(201).json(result);
  });

  app.post("/api/strips/:date/share", async (request, response) => {
    const strip = await getLatestStripForUserDate((request as any).user.id, request.params.date);
    if (!strip) {
      response.status(404).json({ error: "No strip exists for this date.", code: "STRIP_NOT_FOUND" });
      return;
    }

    const payload = await createShareLink((request as any).user.id, strip.id, env, requestBaseUrl(request));
    response.status(201).json(payload);
  });

  app.delete("/api/shares/:shareId", async (request, response) => {
    const share = await getDb().query.shareLinks.findFirst({
      where: eq(shareLinks.shareId, request.params.shareId)
    });

    if (!share) {
      response.status(404).json({ error: "Share not found.", code: "SHARE_NOT_FOUND" });
      return;
    }

    if (share.userId !== (request as any).user.id) {
      response.status(403).json({ error: "You do not own this share link.", code: "SHARE_FORBIDDEN" });
      return;
    }

    const [updated] = await getDb()
      .update(shareLinks)
      .set({
        isActive: false,
        revokedAt: new Date()
      })
      .where(eq(shareLinks.id, share.id))
      .returning();

    response.json({
      share_id: updated.shareId,
      is_active: updated.isActive,
      revoked_at: updated.revokedAt?.toISOString() ?? new Date().toISOString()
    });
  });

  return app;
}
