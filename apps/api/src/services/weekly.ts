import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { DateTime } from "luxon";

import type {
  TornPageReadModel,
  WeeklyIssueReadModel
} from "@dayframe/contracts";
import type { ApiEnv } from "@dayframe/config";

import {
  comicStrips,
  dayContexts,
  generationJobs,
  getDb,
  tornPages,
  weeklyIssues
} from "../db/index.js";
import { isoWeekFromDate } from "../lib/date.js";
import { mapGenerationJob, mapStripReadModel } from "./jobs.js";

function weekBounds(date: string, timezone: string) {
  const base = DateTime.fromISO(date, { zone: timezone });
  return {
    isoWeek: isoWeekFromDate(date, timezone),
    start: base.startOf("week").toISODate()!,
    end: base.startOf("week").plus({ days: 6 }).toISODate()!,
    cutoff: base.startOf("week").plus({ days: 7, hours: 3 })
  };
}

function issueStatus(now: DateTime, cutoff: DateTime, existingStatus: "in_progress" | "compiled" | "shared" | null) {
  if (existingStatus === "shared") {
    return "shared" as const;
  }
  return now >= cutoff ? ("compiled" as const) : ("in_progress" as const);
}

function makeIssueTitle(isoWeek: string, stripCount: number, tornCount: number) {
  return `Issue ${isoWeek} · ${stripCount} strips, ${tornCount} torn pages`;
}

function makeArcSummary(stripCount: number, openTornCount: number, recoveredCount: number) {
  if (stripCount === 0) {
    return openTornCount > 0 ? "A week with gaps waiting to be recovered." : "A quiet week still waiting for its first chapter.";
  }
  if (openTornCount > 0) {
    return `This week carried ${stripCount} finished strips, ${openTornCount} missing pages still open for recovery, and ${recoveredCount} recovered pages.`;
  }
  if (recoveredCount > 0) {
    return `This week carried ${stripCount} finished strips and ${recoveredCount} recovered torn pages.`;
  }
  return `This week carried ${stripCount} finished strips and is ready to revisit.`;
}

function tornPagePrompt(date: string) {
  return `Write a short reflection to recover the missing story beat for ${date}.`;
}

export async function createOrReuseWeeklyCompilationJob(userId: string, date: string, timezone: string) {
  const db = getDb();
  const { end, isoWeek } = weekBounds(date, timezone);
  const existing = await db.query.generationJobs.findFirst({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.jobType, "weekly_compilation"), eq(generationJobs.date, end)),
    orderBy: [desc(generationJobs.createdAt)]
  });

  if (existing && !["ready", "failed"].includes(existing.status)) {
    return existing;
  }

  const attempts = await db.query.generationJobs.findMany({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.jobType, "weekly_compilation"), eq(generationJobs.date, end))
  });

  const [created] = await db
    .insert(generationJobs)
    .values({
      userId,
      date: end,
      jobType: "weekly_compilation",
      status: "queued",
      attemptNumber: attempts.length + 1,
      currentStageRetryCount: 0,
      idempotencyKey: `${userId}:${isoWeek}:weekly:${attempts.length + 1}`,
      triggerSource: "system",
      warnings: []
    })
    .returning();

  return created;
}

export async function createRetroactiveGenerationJob(userId: string, date: string) {
  const db = getDb();
  const existing = await db.query.generationJobs.findFirst({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.date, date), eq(generationJobs.jobType, "retroactive_generation")),
    orderBy: [desc(generationJobs.createdAt)]
  });

  if (existing && !["ready", "failed"].includes(existing.status)) {
    return existing;
  }

  const attempts = await db.query.generationJobs.findMany({
    where: and(eq(generationJobs.userId, userId), eq(generationJobs.date, date), eq(generationJobs.jobType, "retroactive_generation"))
  });

  const [created] = await db
    .insert(generationJobs)
    .values({
      userId,
      date,
      jobType: "retroactive_generation",
      status: "queued",
      attemptNumber: attempts.length + 1,
      currentStageRetryCount: 0,
      idempotencyKey: `${userId}:${date}:retro-${attempts.length + 1}`,
      triggerSource: "torn_page_unlock",
      warnings: []
    })
    .returning();

  return created;
}

export async function compileWeeklyIssue(userId: string, date: string, timezone: string) {
  const db = getDb();
  const { isoWeek, start, end, cutoff } = weekBounds(date, timezone);
  const now = DateTime.now().setZone(timezone);

  const strips = await db.query.comicStrips.findMany({
    where: and(eq(comicStrips.userId, userId), gte(comicStrips.date, start), lte(comicStrips.date, end)),
    orderBy: [asc(comicStrips.date), asc(comicStrips.createdAt)]
  });
  const uniqueStrips = strips.filter((strip, index, collection) => collection.findIndex((item) => item.date === strip.date) === index);

  const existingIssue = await db.query.weeklyIssues.findFirst({
    where: and(eq(weeklyIssues.userId, userId), eq(weeklyIssues.isoWeek, isoWeek))
  });

  const stripIds = uniqueStrips.map((strip) => strip.id);
  const missingDates: string[] = [];
  if (now >= cutoff) {
    for (let day = DateTime.fromISO(start); day <= DateTime.fromISO(end); day = day.plus({ days: 1 })) {
      const candidate = day.toISODate()!;
      if (!uniqueStrips.find((strip) => strip.date === candidate)) {
        missingDates.push(candidate);
      }
    }
  }

  const existingTornPages = await db.query.tornPages.findMany({
    where: and(eq(tornPages.userId, userId), gte(tornPages.date, start), lte(tornPages.date, end)),
    orderBy: [asc(tornPages.date)]
  });

  const createdTornPages: typeof existingTornPages = [];
  if (existingIssue && missingDates.length > 0) {
    for (const missingDate of missingDates) {
      if (!existingTornPages.find((page) => page.date === missingDate)) {
        const [created] = await db
          .insert(tornPages)
          .values({
            weeklyIssueId: existingIssue.id,
            userId,
            date: missingDate,
            status: "locked",
            unlockChallenge: {
              type: "reflection",
              prompt: tornPagePrompt(missingDate)
            }
          })
          .returning();
        createdTornPages.push(created);
      }
    }
  }

  const allTornPages = [...existingTornPages, ...createdTornPages]
    .sort((left, right) => left.date.localeCompare(right.date));
  const openTornCount = allTornPages.filter((page) => page.status !== "generated").length;
  const recoveredCount = allTornPages.filter((page) => page.status === "generated").length;

  const nextStatus = issueStatus(now, cutoff, existingIssue?.status ?? null);
  const issueValues = {
    userId,
    isoWeek,
    weekStart: start,
    weekEnd: end,
    issueTitle: makeIssueTitle(isoWeek, stripIds.length, allTornPages.length),
    arcSummary: makeArcSummary(uniqueStrips.length, openTornCount, recoveredCount),
    coverImageUrl: null,
    stripIds,
    tornPageIds: allTornPages.map((page) => page.id),
    status: nextStatus,
    compiledAt: nextStatus === "compiled" || nextStatus === "shared" ? new Date() : null,
    updatedAt: new Date()
  };

  const issue =
    existingIssue
      ? (
          await db
            .update(weeklyIssues)
            .set(issueValues)
            .where(eq(weeklyIssues.id, existingIssue.id))
            .returning()
        )[0]
      : (
          await db
            .insert(weeklyIssues)
            .values(issueValues)
            .returning()
        )[0];

  if (!existingIssue && missingDates.length > 0) {
    for (const missingDate of missingDates) {
      const [created] = await db
        .insert(tornPages)
        .values({
          weeklyIssueId: issue.id,
          userId,
          date: missingDate,
          status: "locked",
          unlockChallenge: {
            type: "reflection",
            prompt: tornPagePrompt(missingDate)
          }
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        createdTornPages.push(created);
      }
    }

    if (createdTornPages.length > 0) {
      await db
        .update(weeklyIssues)
        .set({
          tornPageIds: [...issue.tornPageIds, ...createdTornPages.map((page) => page.id)],
          updatedAt: new Date()
        })
        .where(eq(weeklyIssues.id, issue.id));
    }
  }

  return db.query.weeklyIssues.findFirst({
    where: eq(weeklyIssues.id, issue.id)
  });
}

function mapTornPage(page: typeof tornPages.$inferSelect): TornPageReadModel {
  return {
    id: page.id,
    weekly_issue_id: page.weeklyIssueId,
    user_id: page.userId,
    date: page.date,
    status: page.status,
    unlock_challenge: page.unlockChallenge,
    unlock_response: page.unlockResponse,
    retroactive_strip_id: page.retroactiveStripId,
    unlocked_at: page.unlockedAt?.toISOString() ?? null
  };
}

export async function getWeeklyIssueReadModel(userId: string, isoWeek: string, env: ApiEnv, baseUrl?: string): Promise<WeeklyIssueReadModel | null> {
  const db = getDb();
  const issue = await db.query.weeklyIssues.findFirst({
    where: and(eq(weeklyIssues.userId, userId), eq(weeklyIssues.isoWeek, isoWeek))
  });

  if (!issue) {
    return null;
  }

  const [strips, pages] = await Promise.all([
    issue.stripIds.length > 0
      ? db.query.comicStrips.findMany({
          where: inArray(comicStrips.id, issue.stripIds),
          orderBy: [asc(comicStrips.date)]
        })
      : [],
    issue.tornPageIds.length > 0
      ? db.query.tornPages.findMany({
          where: inArray(tornPages.id, issue.tornPageIds),
          orderBy: [asc(tornPages.date)]
        })
      : []
  ]);

  return {
    id: issue.id,
    iso_week: issue.isoWeek,
    week_start: issue.weekStart,
    week_end: issue.weekEnd,
    issue_title: issue.issueTitle,
    arc_summary: issue.arcSummary,
    cover_image_url: issue.coverImageUrl,
    strip_ids: issue.stripIds,
    torn_page_ids: issue.tornPageIds,
    status: issue.status,
    compiled_at: issue.compiledAt?.toISOString() ?? null,
    strips: await Promise.all(strips.map((strip) => mapStripReadModel(strip, env, baseUrl))),
    torn_pages: pages.map(mapTornPage)
  };
}

export async function listWeeklyIssueReadModels(userId: string, env: ApiEnv, baseUrl?: string) {
  const db = getDb();
  const issues = await db.query.weeklyIssues.findMany({
    where: eq(weeklyIssues.userId, userId),
    orderBy: [desc(weeklyIssues.weekStart)]
  });

  return Promise.all(issues.map((issue) => getWeeklyIssueReadModel(userId, issue.isoWeek, env, baseUrl))) as Promise<WeeklyIssueReadModel[]>;
}

export async function listTornPageReadModels(userId: string) {
  const db = getDb();
  const pages = await db.query.tornPages.findMany({
    where: eq(tornPages.userId, userId),
    orderBy: [desc(tornPages.date)]
  });
  return pages.map(mapTornPage);
}

export async function unlockTornPage(userId: string, tornPageId: string, responseText: string, env: ApiEnv) {
  const db = getDb();
  const tornPage = await db.query.tornPages.findFirst({
    where: and(eq(tornPages.id, tornPageId), eq(tornPages.userId, userId))
  });

  if (!tornPage || (tornPage.status !== "locked" && tornPage.status !== "unlocked")) {
    return null;
  }

  const latestContext = await db.query.dayContexts.findFirst({
    where: eq(dayContexts.userId, userId),
    orderBy: [desc(dayContexts.date)]
  });
  const timezone = latestContext?.timezone ?? "Europe/Uzhgorod";

  if (!latestContext || latestContext.date !== tornPage.date) {
    const [context] = await db
      .insert(dayContexts)
      .values({
        userId,
        date: tornPage.date,
        timezone,
        calendarEvents: [],
        todoItems: [],
        reflection: responseText,
        sourceStatus: {
          calendar_fetch_status: "skipped",
          tasks_fetch_status: "skipped",
          manual_input_status: "present"
        },
        warnings: [],
        expiresAt: DateTime.utc().plus({ hours: env.DAY_CONTEXT_TTL_HOURS }).toJSDate()
      })
      .onConflictDoUpdate({
        target: [dayContexts.userId, dayContexts.date],
        set: {
          reflection: responseText,
          updatedAt: new Date(),
          expiresAt: DateTime.utc().plus({ hours: env.DAY_CONTEXT_TTL_HOURS }).toJSDate()
        }
      })
      .returning();
    void context;
  }

  const [updated] = await db
    .update(tornPages)
    .set({
      status: "unlocked",
      unlockResponse: responseText,
      unlockedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(tornPages.id, tornPage.id))
    .returning();

  const job = await createRetroactiveGenerationJob(userId, tornPage.date);
  return {
    torn_page_id: updated.id,
    status: updated.status,
    job: mapGenerationJob(job)
  };
}
