import { DateTime } from "luxon";

import {
  assertSchema,
  type ComicScript,
  type EnrichedDayContext,
  type StoryCharacter
} from "@dayframe/contracts";

const leadCharacters: StoryCharacter[] = [
  {
    name: "Mira Vale",
    role: "Protagonist",
    visual_description: "A quick-eyed explorer with a satchel full of maps and bright copper trim."
  },
  {
    name: "Ticker",
    role: "Companion",
    visual_description: "A pocket-sized clockwork fox with brass joints and expressive lantern eyes."
  }
];

export function buildDefaultStoryArc(userId: string) {
  const suffix = userId.slice(0, 4).toUpperCase();
  return {
    protagonist: {
      ...leadCharacters[0],
      name: `Mira ${suffix}`
    },
    world_setting: "The Clockwork Quarter, a city of living rooftops and whispering tram lines.",
    active_threads: ["A map that redraws itself at dusk", "A promise to turn errands into adventures"],
    recurring_characters: [leadCharacters[1]]
  };
}

export function createDeterministicComicScript(input: EnrichedDayContext): ComicScript {
  const tone = input.day_context.reflection ? "reflective adventure" : "buoyant slice-of-life";
  const dayLabel = DateTime.fromISO(input.day_context.date).toFormat("cccc");
  const todoCount = input.day_context.todo_items.length;
  const eventCount = input.day_context.calendar_events.length;
  const protagonist = input.story_arc_snapshot.protagonist;
  const companion = input.story_arc_snapshot.recurring_characters[0] ?? leadCharacters[1];

  const script: ComicScript = {
    id: crypto.randomUUID(),
    day_context_id: input.day_context.id,
    user_id: input.day_context.user_id,
    date: input.day_context.date,
    title: `${dayLabel} and the Small Victories`,
    tone,
    panels: [
      {
        sequence: 1,
        scene_description: `${protagonist.name} steps into the Clockwork Quarter as the city hums awake.`,
        dialogue: [
          { speaker: protagonist.name, text: "A new page means a new route through the city." },
          { speaker: companion.name, text: "And maybe a new shortcut for our nerves." }
        ],
        visual_prompt: "A whimsical comic panel of a hero and clockwork fox entering a brass-and-stone fantasy city at sunrise.",
        mood: "anticipatory",
        narrative_caption: `The day opens with ${eventCount} appointments on the horizon and ${todoCount} quests in the satchel.`
      },
      {
        sequence: 2,
        scene_description: `${protagonist.name} studies a glowing map that rearranges errands into checkpoints.`,
        dialogue: [
          { speaker: protagonist.name, text: "One careful step beats ten frantic leaps." },
          { speaker: companion.name, text: "Then let us call this a precision expedition." }
        ],
        visual_prompt: "Hero and clockwork fox studying a glowing magical map with icons for meetings and tasks, colorful comic style.",
        mood: "focused",
        narrative_caption: input.day_context.reflection
          ? "The city mirrors an inward pause, turning pressure into pacing."
          : "The rhythm stays light, but the route still asks for intention."
      },
      {
        sequence: 3,
        scene_description: `${protagonist.name} clears a cluster of tiny obstacle sprites that stand for unfinished tasks.`,
        dialogue: [
          { speaker: companion.name, text: "Each sprite gone makes the skyline brighter." },
          { speaker: protagonist.name, text: "Then brightness counts as progress today." }
        ],
        visual_prompt: "Comic scene of a hero sweeping away playful obstacle sprites while warm afternoon light spills across rooftops.",
        mood: "determined",
        narrative_caption: `${Math.max(todoCount, 1)} milestones turn into proof that the plot is moving.`
      },
      {
        sequence: 4,
        scene_description: `${protagonist.name} watches evening lights spark on while the city files the day into memory.`,
        dialogue: [
          { speaker: protagonist.name, text: "Not every triumph needs a trumpet." },
          { speaker: companion.name, text: "Some get a whole final panel instead." }
        ],
        visual_prompt: "Cozy evening comic panel of hero and clockwork fox on a rooftop overlooking a lantern city, warm hopeful palette.",
        mood: "hopeful",
        narrative_caption: "By dusk, the day feels less like a checklist and more like a chapter."
      }
    ],
    characters: [protagonist, companion],
    arc_hooks: {
      callback_to: input.previous_day_hooks?.setup_for ?? null,
      setup_for: "Tomorrow's map is already sketching a quieter shortcut through the city.",
      recurring_elements: ["living map", "clockwork fox", "lantern skyline"]
    },
    generation_metadata: {
      model_version: "mock-deterministic-v1",
      attempt_count: 1,
      generation_time_ms: 120,
      prompt_tokens: 0,
      completion_tokens: 0
    }
  };

  assertSchema("comicScript", script);
  return script;
}
