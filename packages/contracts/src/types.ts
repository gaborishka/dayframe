export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type CalendarEvent = {
  title: string;
  start_time: ISODateTime;
  end_time: ISODateTime;
  location: string | null;
  attendees: string[];
};

export type TodoItem = {
  text: string;
  completed: boolean;
  source: "google_tasks" | "manual";
  due_at: ISODateTime | null;
};

export type ManualTodoInput = {
  text: string;
  completed: boolean;
};

export type SourceStatus = {
  calendar_fetch_status: "pending" | "ok" | "failed" | "skipped";
  tasks_fetch_status: "pending" | "ok" | "failed" | "skipped";
  manual_input_status: "empty" | "present";
};

export type DayContext = {
  id: UUID;
  user_id: UUID;
  date: ISODate;
  timezone: string;
  calendar_events: CalendarEvent[];
  todo_items: TodoItem[];
  reflection: string | null;
  source_status: SourceStatus;
  created_at: ISODateTime;
  expires_at: ISODateTime;
};

export type DailyContextUpsertRequest = {
  manual_todos: ManualTodoInput[];
  reflection: string | null;
};

export type DailyContextResponse = {
  date: ISODate;
  timezone: string;
  calendar_events: CalendarEvent[];
  todo_items: TodoItem[];
  reflection: string | null;
  warnings: string[];
  updated_at: ISODateTime;
};

export type StoryCharacter = {
  name: string;
  role: string;
  visual_description: string;
};

export type DialogueLine = {
  speaker: string;
  text: string;
};

export type ComicPanel = {
  sequence: number;
  scene_description: string;
  dialogue: DialogueLine[];
  visual_prompt: string;
  mood: string;
  narrative_caption: string | null;
};

export type ArcHooks = {
  callback_to: string | null;
  setup_for: string | null;
  recurring_elements: string[];
};

export type GenerationMetadata = {
  model_version: string;
  attempt_count: number;
  generation_time_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
};

export type StoryArcSnapshot = {
  protagonist: StoryCharacter;
  world_setting: string;
  active_threads: string[];
  recurring_characters: StoryCharacter[];
};

export type WeeklyContext = {
  iso_week: string;
  day_index_in_week: number;
  existing_strip_dates: ISODate[];
  missing_dates_so_far: ISODate[];
};

export type EnrichedDayContext = {
  day_context: DayContext;
  story_arc_snapshot: StoryArcSnapshot;
  previous_day_hooks: ArcHooks | null;
  weekly_context: WeeklyContext;
};

export type ComicScript = {
  id: UUID;
  day_context_id: UUID;
  user_id: UUID;
  date: ISODate;
  title: string;
  tone: string;
  panels: ComicPanel[];
  characters: StoryCharacter[];
  arc_hooks: ArcHooks;
  generation_metadata: GenerationMetadata;
};

export type JobType = "daily_generation" | "retroactive_generation" | "weekly_compilation";
export type JobStatus =
  | "queued"
  | "retry_scheduled"
  | "ingesting"
  | "generating_script"
  | "validating"
  | "rendering_panels"
  | "composing"
  | "storing"
  | "ready"
  | "failed";

export type JobStage =
  | "ingesting"
  | "generating_script"
  | "validating"
  | "rendering_panels"
  | "composing"
  | "storing";

export type GenerationJob = {
  id: UUID;
  user_id: UUID;
  date: ISODate;
  job_type: JobType;
  status: JobStatus;
  attempt_number: number;
  current_stage_retry_count: number;
  idempotency_key: string;
  trigger_source: "user" | "system" | "torn_page_unlock";
  leased_by: string | null;
  lease_expires_at: ISODateTime | null;
  heartbeat_at: ISODateTime | null;
  last_completed_stage: JobStage | null;
  next_retry_at: ISODateTime | null;
  error_code: string | null;
  error_message: string | null;
  result_strip_id: UUID | null;
  result_weekly_issue_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type JobStatusResponse = {
  job: GenerationJob | null;
  latest_strip: Record<string, unknown> | null;
  warnings: string[];
  can_regenerate: boolean;
};

export type PrivateMediaReference = {
  asset_type: "panel_image" | "composed_strip" | "weekly_cover";
  signed_url: string;
  expires_at: ISODateTime;
};

export type ShareLinkResponse = {
  share_id: string;
  share_url: string;
  is_active: boolean;
  created_at: ISODateTime;
};

export type WeeklyIssueStatus = "in_progress" | "compiled" | "shared";

export type TornPageStatus = "locked" | "unlocked" | "generated";

export type WeeklyIssueReadModel = {
  id: UUID;
  iso_week: string;
  week_start: ISODate;
  week_end: ISODate;
  issue_title: string;
  arc_summary: string;
  cover_image_url: string | null;
  strip_ids: UUID[];
  torn_page_ids: UUID[];
  status: WeeklyIssueStatus;
  compiled_at: ISODateTime | null;
  strips: StripReadModel[];
  torn_pages: TornPageReadModel[];
};

export type TornPageReadModel = {
  id: UUID;
  weekly_issue_id: UUID;
  user_id: UUID;
  date: ISODate;
  status: TornPageStatus;
  unlock_challenge: {
    type: "reflection";
    prompt: string;
  };
  unlock_response: string | null;
  retroactive_strip_id: UUID | null;
  unlocked_at: ISODateTime | null;
};

export type UserPreferences = {
  comic_style: string;
  tone: string;
  language: string;
};

export type UserMeResponse = {
  id: UUID;
  email: string;
  display_name: string;
  preferences: UserPreferences;
};

export type StripReadModel = {
  id: UUID;
  date: ISODate;
  title: string;
  tone: string;
  panels: ComicPanel[];
  characters: StoryCharacter[];
  arc_hooks: ArcHooks;
  generation_metadata: GenerationMetadata;
  media: PrivateMediaReference[];
  share: ShareLinkResponse | null;
  created_at: ISODateTime;
};
