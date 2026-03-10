import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import type {
  DailyContextUpsertRequest,
  DailyContextResponse,
  GenerationJob,
  JobStatusResponse,
  PrivateMediaReference,
  StripReadModel,
  TodoItem,
  UserMeResponse
} from "@dayframe/contracts";
import type { ApiEnv } from "@dayframe/config";

import { comicStrips, dayContexts, generationJobs, getDb, shareLinks, storyArcs, users } from "../db/index.js";
import { dayIndexInWeek, isoWeekFromDate } from "../lib/date.js";
import { createSignedStripUrl } from "./storage.js";

type DbLikeJob = typeof generationJobs.$inferSelect;

function firstRow(result: unknown) {
  return ((result as Record<string, unknown>[] | undefined) ?? [])[0] as DbLikeJob | undefined;
}

const stageResumeMap = {
  null: "ingesting",
  ingesting: "generating_script",
  generating_script: "validating",
  validating: "validating",
  rendering_panels: "rendering_panels",
  composing: "composing",
  storing: "storing"
} as const;

export function mapGenerationJob(job: DbLikeJob): GenerationJob {
  return {
    id: job.id,
    user_id: job.userId,
    date: job.date,
    job_type: job.jobType,
    status: job.status,
    attempt_number: job.attemptNumber,
    current_stage_retry_count: job.currentStageRetryCount,
    idempotency_key: job.idempotencyKey,
    trigger_source: job.triggerSource,
    leased_by: job.leasedBy,
    lease_expires_at: job.leaseExpiresAt?.toISOString() ?? null,
    heartbeat_at: job.heartbeatAt?.toISOString() ?? null,
    last_completed_stage: job.lastCompletedStage,
    next_retry_at: job.nextRetryAt?.toISOString() ?? null,
    error_code: job.errorCode,
    error_message: job.errorMessage,
    result_strip_id: job.resultStripId,
    result_weekly_issue_id: job.resultWeeklyIssueId,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString()
  };
}

export async function ensureStoryArc(userId: string) {
  const db = getDb();
  const existing = await db.query.storyArcs.findFirst({
    where: eq(storyArcs.userId, userId)
  });

  return existing;
}

export async function upsertDayContextForUser(
  userId: string,
  date: string,
  timezone: string,
  payload: DailyContextUpsertRequest,
  env: ApiEnv
) {
  const db = getDb();
  const manualTodos: TodoItem[] = payload.manual_todos.map((todo) => ({
    text: todo.text,
    completed: todo.completed,
    source: "manual",
    due_at: null
  }));
  const sourceStatus = {
    calendar_fetch_status: "skipped" as const,
    tasks_fetch_status: "skipped" as const,
    manual_input_status: manualTodos.length > 0 || payload.reflection ? ("present" as const) : ("empty" as const)
  };
  const expiresAt = DateTime.utc().plus({ hours: env.DAY_CONTEXT_TTL_HOURS }).toJSDate();

  const existing = await db.query.dayContexts.findFirst({
    where: and(eq(dayContexts.userId, userId), eq(dayContexts.date, date))
  });

  if (existing) {
    const [updated] = await db
      .update(dayContexts)
      .set({
        timezone,
        todoItems: manualTodos,
        reflection: payload.reflection,
        sourceStatus,
        warnings: [],
        updatedAt: new Date(),
        expiresAt
      })
      .where(eq(dayContexts.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(dayContexts)
    .values({
      userId,
      date,
      timezone,
      calendarEvents: [],
      todoItems: manualTodos,
      reflection: payload.reflection,
      sourceStatus,
      warnings: [],
      expiresAt
    })
    .returning();

  return created;
}

export function mapDailyContextResponse(record: typeof dayContexts.$inferSelect): DailyContextResponse {
  return {
    date: record.date,
    timezone: record.timezone,
    calendar_events: record.calendarEvents,
    todo_items: record.todoItems,
    reflection: record.reflection,
    warnings: record.warnings,
    updated_at: record.updatedAt.toISOString()
  };
}

export async function getDayContextForUser(userId: string, date: string) {
  const db = getDb();
  return db.query.dayContexts.findFirst({
    where: and(eq(dayContexts.userId, userId), eq(dayContexts.date, date))
  });
}

export async function createOrReuseGenerationJob(userId: string, date: string) {
  const db = getDb();
  const existingActiveJob = await db.query.generationJobs.findFirst({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.date, date)),
    orderBy: [desc(generationJobs.createdAt)]
  });

  if (existingActiveJob && !["ready", "failed"].includes(existingActiveJob.status)) {
    return { job: existingActiveJob, created: false };
  }

  const priorAttempts = await db.query.generationJobs.findMany({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.date, date)),
    orderBy: [desc(generationJobs.createdAt)]
  });

  if (priorAttempts.length >= 2) {
    return { job: priorAttempts[0]!, created: false };
  }

  const attemptNumber = priorAttempts.length + 1;
  const [createdJob] = await db
    .insert(generationJobs)
    .values({
      userId,
      date,
      jobType: "daily_generation",
      status: "queued",
      attemptNumber,
      currentStageRetryCount: 0,
      idempotencyKey: `${userId}:${date}:${attemptNumber}`,
      triggerSource: "user",
      warnings: []
    })
    .returning();

  return { job: createdJob, created: true };
}

export async function getLatestJobForUserDate(userId: string, date: string) {
  const db = getDb();
  return db.query.generationJobs.findFirst({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.date, date)),
    orderBy: [desc(generationJobs.createdAt)]
  });
}

export async function getLatestStripForUserDate(userId: string, date: string) {
  const db = getDb();
  return db.query.comicStrips.findFirst({
    where: and(eq(comicStrips.userId, userId), eq(comicStrips.date, date)),
    orderBy: [desc(comicStrips.createdAt)]
  });
}

export function mapStripReadModel(strip: typeof comicStrips.$inferSelect, env: ApiEnv): StripReadModel {
  const signed = createSignedStripUrl(strip.id, env);
  const media: PrivateMediaReference[] = [
    {
      asset_type: "composed_strip",
      signed_url: signed.url,
      expires_at: signed.expiresAt
    }
  ];

  return {
    id: strip.id,
    date: strip.date,
    title: strip.title,
    tone: strip.tone,
    panels: strip.panels,
    characters: strip.characters,
    arc_hooks: strip.arcHooks,
    generation_metadata: strip.generationMetadata,
    media,
    created_at: strip.createdAt.toISOString()
  };
}

export async function buildJobStatusResponse(userId: string, date: string, env: ApiEnv): Promise<JobStatusResponse | null> {
  const [job, strip] = await Promise.all([getLatestJobForUserDate(userId, date), getLatestStripForUserDate(userId, date)]);

  if (!job && !strip) {
    return null;
  }

  const attempts = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, userId), eq(generationJobs.date, date)));

  return {
    job: job ? mapGenerationJob(job) : null,
    latest_strip: strip
      ? {
          id: strip.id,
          date: strip.date,
          title: strip.title,
          tone: strip.tone,
          created_at: strip.createdAt.toISOString()
        }
      : null,
    warnings: job?.warnings ?? [],
    can_regenerate: Boolean(strip && Number(attempts[0]?.count ?? 0) < 2)
  };
}

export async function listStripsForRange(userId: string, from: string, to: string, env: ApiEnv) {
  const db = getDb();
  const strips = await db.query.comicStrips.findMany({
    where: and(eq(comicStrips.userId, userId), gte(comicStrips.date, from), lte(comicStrips.date, to)),
    orderBy: [desc(comicStrips.date)]
  });

  return strips.map((strip) => mapStripReadModel(strip, env));
}

export async function claimNextJob(workerId: string, leaseTtlSeconds: number) {
  const db = getDb();
  const result = await db.execute(sql`
    WITH next_job AS (
      SELECT id
      FROM generation_jobs
      WHERE status IN ('queued', 'retry_scheduled')
        AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
        AND (status <> 'retry_scheduled' OR next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE generation_jobs
    SET leased_by = ${workerId},
        heartbeat_at = NOW(),
        lease_expires_at = NOW() + make_interval(secs => ${leaseTtlSeconds}),
        status = CASE
          WHEN last_completed_stage IS NULL THEN 'ingesting'
          WHEN last_completed_stage = 'ingesting' THEN 'generating_script'
          WHEN last_completed_stage = 'generating_script' THEN 'validating'
          WHEN last_completed_stage = 'validating' THEN 'validating'
          WHEN last_completed_stage = 'rendering_panels' THEN 'rendering_panels'
          WHEN last_completed_stage = 'composing' THEN 'composing'
          WHEN last_completed_stage = 'storing' THEN 'storing'
          ELSE 'ingesting'
        END,
        updated_at = NOW()
    FROM next_job
    WHERE generation_jobs.id = next_job.id
    RETURNING generation_jobs.*
  `);

  return firstRow(result) ?? null;
}

export async function heartbeatJob(jobId: string, workerId: string, leaseTtlSeconds: number) {
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE generation_jobs
    SET heartbeat_at = NOW(),
        lease_expires_at = NOW() + make_interval(secs => ${leaseTtlSeconds}),
        updated_at = NOW()
    WHERE id = ${jobId}
      AND leased_by = ${workerId}
    RETURNING *
  `);

  return firstRow(result) ?? null;
}

export async function recoverExpiredJobs() {
  const db = getDb();
  await db.execute(sql`
    UPDATE generation_jobs
    SET status = 'queued',
        leased_by = NULL,
        lease_expires_at = NULL,
        heartbeat_at = NULL,
        updated_at = NOW()
    WHERE status IN ('ingesting', 'generating_script', 'validating', 'rendering_panels', 'composing', 'storing')
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < NOW()
  `);
}

export async function updateJobStage(
  jobId: string,
  workerId: string,
  updates: Record<string, unknown>
) {
  const db = getDb();
  const assignments = Object.entries(updates).map(([key, value]) => sql`${sql.raw(key)} = ${value}`);
  const result = await db.execute(sql`
    UPDATE generation_jobs
    SET ${sql.join([...assignments, sql`updated_at = NOW()`], sql`, `)}
    WHERE id = ${jobId}
      AND leased_by = ${workerId}
    RETURNING *
  `);

  return firstRow(result) ?? null;
}

export async function failJob(jobId: string, workerId: string, errorCode: string, errorMessage: string) {
  return updateJobStage(jobId, workerId, {
    status: "failed",
    error_code: errorCode,
    error_message: errorMessage,
    leased_by: null,
    lease_expires_at: null,
    heartbeat_at: null
  });
}

export async function markJobReady(jobId: string, workerId: string, stripId: string) {
  return updateJobStage(jobId, workerId, {
    status: "ready",
    result_strip_id: stripId,
    last_completed_stage: "storing",
    leased_by: null,
    lease_expires_at: null,
    heartbeat_at: null,
    error_code: null,
    error_message: null
  });
}

export async function getUserMe(userId: string): Promise<UserMeResponse | null> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    preferences: user.preferences
  };
}

export function buildWeeklyContext(date: string, timezone: string, existingStripDates: string[]) {
  const isoWeek = isoWeekFromDate(date, timezone);
  const ordered = [...existingStripDates].sort();
  const weekStart = DateTime.fromISO(date, { zone: timezone }).startOf("week");
  const missing: string[] = [];

  for (let index = 0; index < 7; index += 1) {
    const candidate = weekStart.plus({ days: index }).toISODate()!;
    if (candidate <= date && !ordered.includes(candidate)) {
      missing.push(candidate);
    }
  }

  return {
    iso_week: isoWeek,
    day_index_in_week: dayIndexInWeek(date, timezone),
    existing_strip_dates: ordered,
    missing_dates_so_far: missing
  };
}

export async function createShareLink(userId: string, stripId: string, appBaseUrl: string) {
  const db = getDb();
  const existing = await db.query.shareLinks.findFirst({
    where: and(eq(shareLinks.userId, userId), eq(shareLinks.comicStripId, stripId), eq(shareLinks.isActive, true))
  });

  if (existing) {
    return {
      share_id: existing.shareId,
      share_url: `${appBaseUrl}/s/${existing.shareId}`,
      is_active: true,
      created_at: existing.createdAt.toISOString()
    };
  }

  const shareId = `shr_${Math.random().toString(36).slice(2, 10)}`;
  const [created] = await db
    .insert(shareLinks)
    .values({
      shareId,
      userId,
      comicStripId: stripId,
      isActive: true
    })
    .returning();

  return {
    share_id: created.shareId,
    share_url: `${appBaseUrl}/s/${created.shareId}`,
    is_active: created.isActive,
    created_at: created.createdAt.toISOString()
  };
}
