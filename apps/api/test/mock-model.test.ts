import { describe, expect, it } from "vitest";

import { assertSchema } from "@dayframe/contracts";

import { buildDefaultStoryArc, createDeterministicComicScript } from "../src/services/mock-model.js";

describe("createDeterministicComicScript", () => {
  it("returns schema-valid ComicScript output", () => {
    const script = createDeterministicComicScript({
      day_context: {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        date: "2026-03-10",
        timezone: "Europe/Uzhgorod",
        calendar_events: [],
        todo_items: [{ text: "Ship the scaffold", completed: true, source: "manual", due_at: null }],
        reflection: "Today felt full but exciting.",
        source_status: {
          calendar_fetch_status: "skipped",
          tasks_fetch_status: "skipped",
          manual_input_status: "present"
        },
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString()
      },
      story_arc_snapshot: buildDefaultStoryArc(crypto.randomUUID()),
      previous_day_hooks: null,
      weekly_context: {
        iso_week: "2026-W11",
        day_index_in_week: 2,
        existing_strip_dates: [],
        missing_dates_so_far: []
      }
    });

    expect(script.panels).toHaveLength(4);
    expect(() => assertSchema("comicScript", script)).not.toThrow();
  });
});
