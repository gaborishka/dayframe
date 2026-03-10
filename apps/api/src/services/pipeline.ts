import crypto from "node:crypto";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import {
  assertSchema,
  type ComicScript,
  type EnrichedDayContext
} from "@dayframe/contracts";
import type { ApiEnv } from "@dayframe/config";

import {
  comicScripts,
  comicStrips,
  dayContexts,
  generationJobs,
  getDb,
  storyArcs
} from "../db/index.js";
import { buildWeeklyContext, markJobReady, updateJobStage } from "./jobs.js";
import { buildDefaultStoryArc, createDeterministicComicScript } from "./mock-model.js";

type PipelineError = {
  code: string;
  message: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractSensitiveInputs(dayContext: typeof dayContexts.$inferSelect) {
  return [
    dayContext.reflection ?? "",
    ...dayContext.todoItems.map((item) => item.text),
    ...dayContext.calendarEvents.map((event) => event.title),
    ...dayContext.calendarEvents.map((event) => event.location ?? ""),
    ...dayContext.calendarEvents.flatMap((event) => event.attendees)
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function validateAnonymization(script: ComicScript, dayContext: typeof dayContexts.$inferSelect) {
  const errors: string[] = [];
  const text = JSON.stringify({
    title: script.title,
    panels: script.panels.map((panel) => ({
      scene_description: panel.scene_description,
      dialogue: panel.dialogue,
      visual_prompt: panel.visual_prompt
    }))
  }).toLowerCase();

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    errors.push("Detected email-like output in script.");
  }

  const speakers = new Set(script.characters.map((character) => character.name));
  for (const panel of script.panels) {
    for (const line of panel.dialogue) {
      if (!speakers.has(line.speaker)) {
        errors.push(`Unknown dialogue speaker: ${line.speaker}`);
      }
    }
  }

  for (const sourceText of extractSensitiveInputs(dayContext)) {
    const words = sourceText.split(/\s+/).filter(Boolean);
    for (let index = 0; index <= words.length - 4; index += 1) {
      const phrase = words.slice(index, index + 4).join(" ");
      if (phrase.length > 0 && text.includes(phrase)) {
        errors.push(`Detected verbatim sensitive phrase in output: ${phrase}`);
        break;
      }
    }
  }

  return errors;
}

function buildPanelSvg(title: string, panel: ComicScript["panels"][number]) {
  const dialogue = panel.dialogue.map((line) => `${line.speaker}: ${line.text}`).join(" ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">`,
    `<rect width="960" height="720" fill="#f4efe1" rx="28" />`,
    `<rect x="24" y="24" width="912" height="672" fill="#fff9ec" stroke="#1f2937" stroke-width="6" rx="24" />`,
    `<text x="60" y="110" font-size="42" font-family="Georgia, serif" fill="#1f2937">${escapeXml(title)}</text>`,
    `<text x="60" y="182" font-size="30" font-family="Arial, sans-serif" fill="#374151">${escapeXml(panel.scene_description)}</text>`,
    `<text x="60" y="282" font-size="24" font-family="Arial, sans-serif" fill="#111827">${escapeXml(dialogue)}</text>`,
    panel.narrative_caption
      ? `<text x="60" y="620" font-size="24" font-family="Arial, sans-serif" fill="#92400e">${escapeXml(panel.narrative_caption)}</text>`
      : "",
    `</svg>`
  ].join("");
}

function composeStripSvg(script: ComicScript) {
  const columns = script.panels.length === 5 ? 3 : script.panels.length === 6 ? 3 : 2;
  const rows = Math.ceil(script.panels.length / columns);
  const panelWidth = 620;
  const panelHeight = 420;
  const width = columns * panelWidth + 80;
  const height = rows * panelHeight + 180;
  const body = script.panels
    .map((panel, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 40 + column * panelWidth;
      const y = 120 + row * panelHeight;
      const dialogue = panel.dialogue.map((line) => `${line.speaker}: ${line.text}`).join(" ");
      return [
        `<g transform="translate(${x}, ${y})">`,
        `<rect width="${panelWidth - 24}" height="${panelHeight - 24}" fill="#fffdf5" stroke="#111827" stroke-width="4" rx="28" />`,
        `<rect x="20" y="20" width="${panelWidth - 64}" height="84" fill="#fbbf24" opacity="0.15" rx="18" />`,
        `<text x="32" y="62" font-size="22" font-family="Arial, sans-serif" fill="#92400e">${escapeXml(panel.mood.toUpperCase())}</text>`,
        `<text x="32" y="124" font-size="28" font-family="Georgia, serif" fill="#111827">${escapeXml(panel.scene_description)}</text>`,
        `<text x="32" y="220" font-size="21" font-family="Arial, sans-serif" fill="#374151">${escapeXml(dialogue)}</text>`,
        panel.narrative_caption
          ? `<text x="32" y="${panelHeight - 74}" font-size="20" font-family="Arial, sans-serif" fill="#7c2d12">${escapeXml(panel.narrative_caption)}</text>`
          : "",
        `</g>`
      ].join("");
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.min(height, 2048)}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#efe8d8" />`,
    `<text x="40" y="72" font-size="44" font-family="Georgia, serif" fill="#111827">${escapeXml(script.title)}</text>`,
    body,
    `</svg>`
  ].join("");
}

export async function buildEnrichedDayContext(job: typeof generationJobs.$inferSelect) {
  const db = getDb();
  const dayContext = await db.query.dayContexts.findFirst({
    where: and(eq(dayContexts.userId, job.userId), eq(dayContexts.date, job.date))
  });

  if (!dayContext) {
    throw {
      code: "NO_INPUT_CONTEXT",
      message: "No usable daily context is available for generation."
    } satisfies PipelineError;
  }

  const arc = (await db.query.storyArcs.findFirst({
    where: eq(storyArcs.userId, job.userId)
  })) ?? null;

  const strips = await db.query.comicStrips.findMany({
    where: eq(comicStrips.userId, job.userId),
    orderBy: [desc(comicStrips.createdAt)]
  });

  const enriched: EnrichedDayContext = {
    day_context: {
      id: dayContext.id,
      user_id: dayContext.userId,
      date: dayContext.date,
      timezone: dayContext.timezone,
      calendar_events: dayContext.calendarEvents,
      todo_items: dayContext.todoItems,
      reflection: dayContext.reflection,
      source_status: dayContext.sourceStatus,
      created_at: dayContext.createdAt.toISOString(),
      expires_at: dayContext.expiresAt.toISOString()
    },
    story_arc_snapshot: arc
      ? {
          protagonist: arc.protagonist,
          world_setting: arc.worldSetting,
          active_threads: arc.activeThreads,
          recurring_characters: arc.recurringCharacters
        }
      : buildDefaultStoryArc(job.userId),
    previous_day_hooks: arc?.lastArcHooks ?? null,
    weekly_context: buildWeeklyContext(
      dayContext.date,
      dayContext.timezone,
      strips.map((strip) => strip.date)
    )
  };

  assertSchema("enrichedDayContext", enriched);
  return { enriched, dayContext, arc };
}

export async function runPipelineStage(job: typeof generationJobs.$inferSelect, workerId: string, env: ApiEnv) {
  switch (job.status) {
    case "ingesting":
      return updateJobStage(job.id, workerId, {
        status: "generating_script",
        last_completed_stage: "ingesting",
        current_stage_retry_count: 0
      });
    case "generating_script": {
      const { enriched } = await buildEnrichedDayContext(job);
      const script = createDeterministicComicScript(enriched);

      return updateJobStage(job.id, workerId, {
        candidate_script: script,
        status: "validating",
        last_completed_stage: "generating_script",
        current_stage_retry_count: 0
      });
    }
    case "validating": {
      const db = getDb();
      const latest = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, job.id)
      });

      if (!latest?.candidateScript) {
        throw { code: "SCRIPT_MISSING", message: "Candidate script missing for validation." } satisfies PipelineError;
      }

      const dayContext = await db.query.dayContexts.findFirst({
        where: and(eq(dayContexts.userId, latest.userId), eq(dayContexts.date, latest.date))
      });

      if (!dayContext) {
        throw { code: "NO_INPUT_CONTEXT", message: "No usable daily context is available for generation." } satisfies PipelineError;
      }

      assertSchema("comicScript", latest.candidateScript);
      const validationErrors = validateAnonymization(latest.candidateScript, dayContext);

      if (validationErrors.length > 0) {
        throw {
          code: "SCRIPT_VALIDATION_FAILED",
          message: validationErrors.join(" ")
        } satisfies PipelineError;
      }

      return updateJobStage(job.id, workerId, {
        status: "rendering_panels",
        last_completed_stage: "validating",
        current_stage_retry_count: 0,
        warnings: []
      });
    }
    case "rendering_panels": {
      const db = getDb();
      const latest = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, job.id)
      });

      if (!latest?.candidateScript) {
        throw { code: "SCRIPT_MISSING", message: "Candidate script missing for render." } satisfies PipelineError;
      }

      const panelAssets = latest.candidateScript.panels.map((panel) => ({
        sequence: panel.sequence,
        asset_path: `users/${latest.userId}/strips/${latest.date}/panel_${panel.sequence}.svg`,
        svg: buildPanelSvg(latest.candidateScript!.title, panel)
      }));

      return updateJobStage(job.id, workerId, {
        panel_assets: panelAssets,
        status: "composing",
        last_completed_stage: "rendering_panels",
        current_stage_retry_count: 0
      });
    }
    case "composing": {
      const db = getDb();
      const latest = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, job.id)
      });

      if (!latest?.candidateScript) {
        throw { code: "SCRIPT_MISSING", message: "Candidate script missing for compose." } satisfies PipelineError;
      }

      const composed = composeStripSvg(latest.candidateScript);
      return updateJobStage(job.id, workerId, {
        composed_strip_svg: composed,
        status: "storing",
        last_completed_stage: "composing",
        current_stage_retry_count: 0
      });
    }
    case "storing": {
      const db = getDb();
      const latest = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, job.id)
      });

      if (!latest?.candidateScript || !latest.composedStripSvg) {
        throw { code: "COMPOSED_STRIP_MISSING", message: "Composed strip is missing." } satisfies PipelineError;
      }

      const dayContext = await db.query.dayContexts.findFirst({
        where: and(eq(dayContexts.userId, latest.userId), eq(dayContexts.date, latest.date))
      });

      if (!dayContext) {
        throw { code: "NO_INPUT_CONTEXT", message: "No usable daily context is available for generation." } satisfies PipelineError;
      }

      const existingReadyStrips = await db.query.comicStrips.findMany({
        where: and(eq(comicStrips.userId, latest.userId), eq(comicStrips.date, latest.date), isNull(comicStrips.supersededBy))
      });

      const [storedScript] = await db
        .insert(comicScripts)
        .values({
          id: latest.candidateScript.id,
          dayContextId: dayContext.id,
          userId: latest.userId,
          date: latest.date,
          payload: latest.candidateScript
        })
        .returning();

      const [storedStrip] = await db
        .insert(comicStrips)
        .values({
          userId: latest.userId,
          dayContextId: dayContext.id,
          comicScriptId: storedScript.id,
          date: latest.date,
          title: latest.candidateScript.title,
          tone: latest.candidateScript.tone,
          panels: latest.candidateScript.panels,
          characters: latest.candidateScript.characters,
          arcHooks: latest.candidateScript.arc_hooks,
          generationMetadata: latest.candidateScript.generation_metadata,
          composedSvg: latest.composedStripSvg
        })
        .returning();

      if (existingReadyStrips.length > 0) {
        await db
          .update(comicStrips)
          .set({
            supersededBy: storedStrip.id,
            updatedAt: new Date()
          })
          .where(inArray(
            comicStrips.id,
            existingReadyStrips.map((strip) => strip.id)
          ));
      }

      const { enriched, arc } = await buildEnrichedDayContext(latest);
      if (arc) {
        await db
          .update(storyArcs)
          .set({
            protagonist: enriched.story_arc_snapshot.protagonist,
            worldSetting: enriched.story_arc_snapshot.world_setting,
            activeThreads: enriched.story_arc_snapshot.active_threads,
            recurringCharacters: enriched.story_arc_snapshot.recurring_characters,
            lastArcHooks: latest.candidateScript.arc_hooks,
            updatedAt: new Date()
          })
          .where(eq(storyArcs.id, arc.id));
      } else {
        await db.insert(storyArcs).values({
          userId: latest.userId,
          protagonist: enriched.story_arc_snapshot.protagonist,
          worldSetting: enriched.story_arc_snapshot.world_setting,
          activeThreads: enriched.story_arc_snapshot.active_threads,
          recurringCharacters: enriched.story_arc_snapshot.recurring_characters,
          lastArcHooks: latest.candidateScript.arc_hooks
        });
      }

      await db
        .update(dayContexts)
        .set({
          expiresAt: DateTime.utc().plus({ hours: env.DAY_CONTEXT_TTL_HOURS }).toJSDate(),
          updatedAt: new Date()
        })
        .where(eq(dayContexts.id, dayContext.id));

      return markJobReady(job.id, workerId, storedStrip.id);
    }
    default:
      return job;
  }
}
