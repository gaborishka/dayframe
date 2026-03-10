import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import type {
  ArcHooks,
  CalendarEvent,
  ComicPanel,
  ComicScript,
  DailyContextResponse,
  DayContext,
  GenerationJob,
  GenerationMetadata,
  StoryCharacter,
  UserPreferences
} from "@dayframe/contracts";

type PanelAsset = {
  sequence: number;
  asset_path: string;
  svg: string;
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at", { withTimezone: true }),
  preferences: jsonb("preferences")
    .$type<UserPreferences>()
    .notNull()
    .default(sql`'{"comic_style":"adventure","tone":"humorous","language":"en"}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const storyArcs = pgTable("story_arcs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  protagonist: jsonb("protagonist").$type<StoryCharacter>().notNull(),
  worldSetting: text("world_setting").notNull(),
  activeThreads: jsonb("active_threads").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  recurringCharacters: jsonb("recurring_characters").$type<StoryCharacter[]>().notNull().default(sql`'[]'::jsonb`),
  lastArcHooks: jsonb("last_arc_hooks").$type<ArcHooks | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const dayContexts = pgTable(
  "day_contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    timezone: text("timezone").notNull(),
    calendarEvents: jsonb("calendar_events").$type<CalendarEvent[]>().notNull().default(sql`'[]'::jsonb`),
    todoItems: jsonb("todo_items").$type<DayContext["todo_items"]>().notNull().default(sql`'[]'::jsonb`),
    reflection: text("reflection"),
    sourceStatus: jsonb("source_status").$type<DayContext["source_status"]>().notNull(),
    warnings: jsonb("warnings").$type<DailyContextResponse["warnings"]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    userDateUnique: uniqueIndex("day_contexts_user_date_idx").on(table.userId, table.date)
  })
);

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  jobType: text("job_type").notNull().$type<GenerationJob["job_type"]>(),
  status: text("status").notNull().$type<GenerationJob["status"]>(),
  attemptNumber: integer("attempt_number").notNull(),
  currentStageRetryCount: integer("current_stage_retry_count").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  triggerSource: text("trigger_source").notNull().$type<GenerationJob["trigger_source"]>(),
  leasedBy: text("leased_by"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  lastCompletedStage: text("last_completed_stage").$type<GenerationJob["last_completed_stage"]>(),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  resultStripId: uuid("result_strip_id"),
  resultWeeklyIssueId: uuid("result_weekly_issue_id"),
  warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  candidateScript: jsonb("candidate_script").$type<ComicScript | null>(),
  panelAssets: jsonb("panel_assets").$type<PanelAsset[] | null>(),
  composedStripSvg: text("composed_strip_svg"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const comicScripts = pgTable("comic_scripts", {
  id: uuid("id").primaryKey(),
  dayContextId: uuid("day_context_id")
    .notNull()
    .references(() => dayContexts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  payload: jsonb("payload").$type<ComicScript>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const comicStrips = pgTable("comic_strips", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dayContextId: uuid("day_context_id")
    .notNull()
    .references(() => dayContexts.id, { onDelete: "cascade" }),
  comicScriptId: uuid("comic_script_id")
    .notNull()
    .references(() => comicScripts.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  title: text("title").notNull(),
  tone: text("tone").notNull(),
  panels: jsonb("panels").$type<ComicPanel[]>().notNull(),
  characters: jsonb("characters").$type<StoryCharacter[]>().notNull(),
  arcHooks: jsonb("arc_hooks").$type<ArcHooks>().notNull(),
  generationMetadata: jsonb("generation_metadata").$type<GenerationMetadata>().notNull(),
  composedSvg: text("composed_svg").notNull(),
  supersededBy: uuid("superseded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const shareLinks = pgTable("share_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  shareId: text("share_id").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  comicStripId: uuid("comic_strip_id")
    .notNull()
    .references(() => comicStrips.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

export type DbUser = typeof users.$inferSelect;
export type DbDayContext = typeof dayContexts.$inferSelect;
export type DbGenerationJob = typeof generationJobs.$inferSelect;
export type DbComicStrip = typeof comicStrips.$inferSelect;
