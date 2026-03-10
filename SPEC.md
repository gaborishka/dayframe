# DayFrame Service Specification

Status: Draft v2

Purpose: Define an implementation-ready v1 service that turns a user's daily context into AI-generated comic strips, while keeping raw personal data inside a private script-generation boundary.

## 1. Product Thesis

DayFrame is a web application that transforms a user's day into a comic strip. It connects to Google Calendar and Google Tasks, collects a short reflection and manual todos, and turns that input into a visual story with recurring characters, weekly chapters, and recoverable "torn pages" for missed days.

The product promise for v1 is:

- It replaces guilt-driven journaling with curiosity-driven storytelling.
- It generates comics from the user's real day, not generic prompts.
- It keeps raw user context out of external text LLMs by using a private fine-tuned model for the script-generation step.
- It turns consistency into narrative progression through weekly issues, recurring arcs, and torn-page recovery.

DayFrame is not a productivity optimizer. It does not recommend tasks, analyze performance, or coach habits. The output is a story artifact, not a planning tool.

## 2. Scope Layers

### 2.1 v1 Demo Scope

The implementation target for v1 includes the full narrative loop:

- Google OAuth sign-in.
- Google Calendar ingestion.
- Google Tasks ingestion.
- Manual reflection and manual todos.
- Private fine-tuned script generation on DigitalOcean GPU infrastructure.
- Gemini image generation from anonymized visual prompts only.
- Comic strip composition and storage.
- Daily comic viewing.
- Weekly issue compilation.
- Torn-page creation for missed days.
- One unlock flow for retroactive strip generation.
- Public sharing of generated strips.

### 2.2 Stretch Scope

The following may be implemented if time permits, but are not required for an acceptable end-to-end demo:

- Cover image generation for weekly issues.
- Multiple comic style presets beyond the default style family.
- Push notifications or email notifications.
- Advanced torn-page challenge types beyond a single baseline challenge.
- Animated transitions in the comic viewer.

### 2.3 Future Scope

The following are explicitly post-v1:

- Native mobile app or PWA.
- Additional integrations such as Todoist, Apple Calendar, Notion, Microsoft To Do.
- Self-hosted image generation or custom image-model fine-tuning.
- Multi-language support beyond a single primary UI language.
- Collaborative or social-network features.
- Print-ready export and subscription billing.

## 3. Goals and Non-Goals

### 3.1 Goals

- Produce one personalized comic strip per requested day from calendar, tasks, and manual input.
- Use a private fine-tuned text model as the required script-generation boundary for raw user data.
- Preserve continuity across days and compile a weekly issue with visible gaps for missed days.
- Keep the v1 architecture implementable under hackathon constraints while still being clear enough to build from directly.
- Support public sharing of finished comic artifacts without exposing raw or semi-raw personal context.

### 3.2 Non-Goals

- Real-time collaboration or social feed mechanics.
- End-to-end encrypted archival storage of generated comics.
- AI productivity advice, prioritization, or coaching.
- Complex retry-free "instant" synchronous generation in the request-response cycle.
- External text-model fallback using raw or partially anonymized user data.

## 4. Canonical System Overview

### 4.1 Main Components

1. `Web Client`
   - React SPA served from DigitalOcean App Platform.
   - Handles authentication, manual input, status polling, comic viewing, torn-page unlock, and sharing.

2. `API Server`
   - Node.js/Express service on App Platform.
   - Owns auth, user-facing APIs, idempotency checks, and public share endpoints.

3. `Worker`
   - Separate worker process.
   - Executes generation jobs, weekly compilation jobs, retries, purge logic, and queue consumers.

4. `Private Script Model`
   - Fine-tuned LLM deployed on a GPU Droplet in DigitalOcean VPC.
   - Accepts raw day context and returns anonymized comic scripts only.

5. `Image Generation Service`
   - Gemini image generation called only with anonymized visual prompts.

6. `Storage Layer`
   - PostgreSQL for structured application data, jobs, story state, and generation metadata.
   - DigitalOcean Spaces for panel images, composed strips, and shared artifacts.

### 4.2 Execution Model

Generation is asynchronous by default:

- The client submits or updates daily input.
- The client calls `POST /api/day/{date}/generate`.
- The API creates or returns a `GenerationJob`.
- The worker executes the pipeline.
- The client polls job status until the strip is `ready` or `failed`.

Weekly issue compilation also runs as a job, triggered by schedule or on-demand backfill.

### 4.3 External Dependencies

- Google OAuth 2.0 for identity and consent.
- Google Calendar API v3.
- Google Tasks API v1.
- Gemini `gemini-2.0-flash-preview-image-generation` for panel rendering.
- DigitalOcean App Platform.
- DigitalOcean GPU Droplet.
- DigitalOcean Spaces.
- DigitalOcean Managed PostgreSQL.
- `doctl` CLI for deployment, infrastructure inspection, and demo-day operational commands.

Gradient Serverless Inference is not required for the raw-data path in v1. If used later, it must receive only already anonymized and policy-approved content.

## 5. Domain Model

### 5.1 User

- `id` (UUID)
- `email` (string)
- `display_name` (string)
- `google_access_token` (encrypted string or null)
- `google_refresh_token` (encrypted string or null)
- `google_token_expires_at` (timestamp or null)
- `created_at` (timestamp)
- `preferences` (JSON)
  - `comic_style` (string, default `adventure`)
  - `tone` (string, default `humorous`)
  - `language` (string, default `en`)

### 5.2 DayContext

Raw daily input used for generation. This is sensitive data.

- `id` (UUID)
- `user_id` (UUID)
- `date` (date)
- `timezone` (IANA timezone string)
- `calendar_events` (list of `CalendarEvent`)
- `todo_items` (list of `TodoItem`)
- `reflection` (string or null, max 1000 chars)
- `source_status` (object)
  - `calendar_fetch_status` (`pending`, `ok`, `failed`, `skipped`)
  - `tasks_fetch_status` (`pending`, `ok`, `failed`, `skipped`)
  - `manual_input_status` (`empty`, `present`)
- `created_at` (timestamp)
- `expires_at` (timestamp)

`CalendarEvent`:

- `title` (string)
- `start_time` (timestamp)
- `end_time` (timestamp)
- `location` (string or null)
- `attendees` (list of strings)

`TodoItem`:

- `text` (string)
- `completed` (boolean)
- `source` (`google_tasks`, `manual`)
- `due_at` (timestamp or null)

### 5.3 EnrichedDayContext

Internal worker payload assembled immediately before script generation. This is also sensitive data.

- `day_context` (`DayContext`)
- `story_arc_snapshot` (object)
  - `protagonist`
  - `world_setting`
  - `active_threads`
  - `recurring_characters`
- `previous_day_hooks` (object or null)
- `weekly_context` (object)
  - `iso_week`
  - `day_index_in_week`
  - `existing_strip_dates`
  - `missing_dates_so_far`

`EnrichedDayContext` is not exposed via public API and is not sent to external providers.

### 5.4 ComicScript

Anonymized structured output from the private script model.

- `id` (UUID)
- `day_context_id` (UUID)
- `user_id` (UUID)
- `date` (date)
- `title` (string)
- `tone` (string)
- `panels` (list, 4-6 items)
- `characters` (list of fictional characters)
- `arc_hooks` (object)
  - `callback_to` (string or null)
  - `setup_for` (string or null)
  - `recurring_elements` (list of strings)
- `generation_metadata` (object)
  - `model_version` (string)
  - `attempt_count` (integer)
  - `generation_time_ms` (integer)
  - `prompt_tokens` (integer)
  - `completion_tokens` (integer)

Each `panel` contains:

- `sequence` (integer, 1-based)
- `scene_description` (string)
- `dialogue` (list of `{ speaker, text }`)
- `visual_prompt` (string, max 500 chars)
- `mood` (string)
- `narrative_caption` (string or null)

### 5.5 ComicStrip

User-visible visual artifact.

- `id` (UUID)
- `comic_script_id` (UUID)
- `user_id` (UUID)
- `date` (date)
- `status` (`generating`, `composing`, `ready`, `failed`)
- `panel_images` (list of `{ sequence, asset_path, width, height, render_status }`)
- `composed_strip_asset_path` (string or null)
- `failure_code` (string or null)
- `created_at` (timestamp)

### 5.6 StoryArc

Persistent narrative state per user.

- `id` (UUID)
- `user_id` (UUID)
- `protagonist` (fictional character object)
- `world_setting` (string)
- `active_threads` (list, max 3)
- `recurring_characters` (list)
- `chapter_count` (integer)
- `last_updated` (timestamp)

### 5.7 WeeklyIssue

- `id` (UUID)
- `user_id` (UUID)
- `iso_week` (string, e.g. `2026-W11`)
- `week_start` (date)
- `week_end` (date)
- `issue_title` (string)
- `arc_summary` (string)
- `cover_image_url` (string or null)
- `strip_ids` (ordered list)
- `torn_page_ids` (ordered list)
- `status` (`in_progress`, `compiled`, `shared`)
- `compiled_at` (timestamp or null)

Rule: at most one `WeeklyIssue` exists per user per ISO week.

### 5.8 TornPage

- `id` (UUID)
- `weekly_issue_id` (UUID)
- `user_id` (UUID)
- `date` (date)
- `status` (`locked`, `unlocked`, `generated`)
- `unlock_challenge` (object)
  - `type` (`reflection`)
  - `prompt` (string)
- `unlock_response` (string or null)
- `retroactive_strip_id` (UUID or null)
- `unlocked_at` (timestamp or null)

v1 supports one challenge type only: `reflection`.

### 5.9 GenerationJob

Canonical async job record for daily strip generation.

- `id` (UUID)
- `user_id` (UUID)
- `date` (date)
- `job_type` (`daily_generation`, `retroactive_generation`, `weekly_compilation`)
- `status` (`queued`, `retry_scheduled`, `ingesting`, `generating_script`, `validating`, `rendering_panels`, `composing`, `storing`, `ready`, `failed`)
- `attempt_number` (integer)
- `current_stage_retry_count` (integer)
- `idempotency_key` (string)
- `trigger_source` (`user`, `system`, `torn_page_unlock`)
- `leased_by` (string or null)
- `lease_expires_at` (timestamp or null)
- `heartbeat_at` (timestamp or null)
- `last_completed_stage` (`ingesting`, `generating_script`, `validating`, `rendering_panels`, `composing`, `storing` or null)
- `next_retry_at` (timestamp or null)
- `error_code` (string or null)
- `error_message` (string or null)
- `result_strip_id` (UUID or null)
- `result_weekly_issue_id` (UUID or null)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 5.10 ShareLink

- `id` (UUID)
- `share_id` (string, URL-safe unique token)
- `user_id` (UUID)
- `comic_strip_id` (UUID)
- `is_active` (boolean)
- `created_at` (timestamp)
- `revoked_at` (timestamp or null)

### 5.11 PrivateMediaReference

- `asset_type` (`panel_image`, `composed_strip`, `weekly_cover`)
- `signed_url` (string)
- `expires_at` (timestamp)

### 5.12 API Request and Response Types

`DailyContextUpsertRequest`

- `manual_todos` (list of `{ text, completed }`)
- `reflection` (string or null)

`DailyContextResponse`

- `date` (date)
- `timezone` (string)
- `calendar_events` (list)
- `todo_items` (list)
- `reflection` (string or null)
- `warnings` (list of strings)
- `updated_at` (timestamp)

`JobStatusResponse`

- `job` (`GenerationJob` or null)
- `latest_strip` (object or null)
- `warnings` (list of strings)
- `can_regenerate` (boolean)

`TornPageUnlockRequest`

- `response_text` (string)

`TornPageUnlockResponse`

- `torn_page_id` (UUID)
- `status` (`locked`, `unlocked`, `generated`)
- `job` (`GenerationJob` or null)

`ShareLinkResponse`

- `share_id` (string)
- `share_url` (string)
- `is_active` (boolean)
- `created_at` (timestamp)

### 5.13 Canonical JSON Shapes

The following shapes are the canonical wire/data contracts for v1. Exact implementation may add internal metadata, but these keys and meanings must remain stable.

`DayContext`

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "date": "2026-03-10",
  "timezone": "Europe/Uzhgorod",
  "calendar_events": [
    {
      "title": "Planning meeting",
      "start_time": "2026-03-10T09:00:00+02:00",
      "end_time": "2026-03-10T10:00:00+02:00",
      "location": "Main office",
      "attendees": ["person@example.com"]
    }
  ],
  "todo_items": [
    {
      "text": "Finish auth bug",
      "completed": true,
      "source": "google_tasks",
      "due_at": "2026-03-10T18:00:00+02:00"
    }
  ],
  "reflection": "Today felt chaotic but productive.",
  "source_status": {
    "calendar_fetch_status": "ok",
    "tasks_fetch_status": "ok",
    "manual_input_status": "present"
  },
  "created_at": "2026-03-10T18:10:00Z",
  "expires_at": "2026-03-11T18:10:00Z"
}
```

`EnrichedDayContext`

```json
{
  "day_context": {},
  "story_arc_snapshot": {
    "protagonist": {},
    "world_setting": "floating city adventure",
    "active_threads": [],
    "recurring_characters": []
  },
  "previous_day_hooks": {
    "callback_to": "the unfinished gate",
    "setup_for": "a second encounter at dawn",
    "recurring_elements": ["clockbird"]
  },
  "weekly_context": {
    "iso_week": "2026-W11",
    "day_index_in_week": 2,
    "existing_strip_dates": ["2026-03-09"],
    "missing_dates_so_far": []
  }
}
```

`ComicScript`

```json
{
  "id": "uuid",
  "day_context_id": "uuid",
  "user_id": "uuid",
  "date": "2026-03-10",
  "title": "The Tower of Tiny Victories",
  "tone": "adventure",
  "panels": [
    {
      "sequence": 1,
      "scene_description": "A fictional hero enters a towering hall of clocks.",
      "dialogue": [
        {
          "speaker": "Ari",
          "text": "The day's first quest begins."
        }
      ],
      "visual_prompt": "Comic panel, energetic fantasy office, towering clock hall, determined hero, vibrant light",
      "mood": "tense",
      "narrative_caption": "Morning arrived with a list of trials."
    }
  ],
  "characters": [
    {
      "name": "Ari",
      "role": "protagonist",
      "visual_description": "messenger-adventurer with a satchel of glowing notes"
    }
  ],
  "arc_hooks": {
    "callback_to": "the unfinished gate",
    "setup_for": "the return of the clockbird",
    "recurring_elements": ["clockbird"]
  },
  "generation_metadata": {
    "model_version": "qwen3-8b-dayframe-v1",
    "attempt_count": 1,
    "generation_time_ms": 4200,
    "prompt_tokens": 1820,
    "completion_tokens": 620
  }
}
```

`ComicStrip`

```json
{
  "id": "uuid",
  "comic_script_id": "uuid",
  "user_id": "uuid",
  "date": "2026-03-10",
  "status": "ready",
  "panel_images": [
    {
      "sequence": 1,
      "asset_path": "users/uuid/strips/2026-03-10/panel_1.png",
      "width": 1024,
      "height": 1024,
      "render_status": "ready"
    }
  ],
  "composed_strip_asset_path": "users/uuid/strips/2026-03-10/strip.png",
  "failure_code": null,
  "created_at": "2026-03-10T18:12:00Z"
}
```

`GenerationJob`

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "date": "2026-03-10",
  "job_type": "daily_generation",
  "status": "rendering_panels",
  "attempt_number": 1,
  "current_stage_retry_count": 0,
  "idempotency_key": "user-id:2026-03-10:1",
  "trigger_source": "user",
  "leased_by": "worker-1",
  "lease_expires_at": "2026-03-10T18:13:00Z",
  "heartbeat_at": "2026-03-10T18:11:30Z",
  "last_completed_stage": "validating",
  "next_retry_at": null,
  "error_code": null,
  "error_message": null,
  "result_strip_id": null,
  "result_weekly_issue_id": null,
  "created_at": "2026-03-10T18:10:00Z",
  "updated_at": "2026-03-10T18:11:00Z"
}
```

## 6. Source-of-Truth Rules

The system follows these ownership rules:

- `DayContext` is the source of truth for raw daily input during the active generation window only.
- `ComicScript` is the source of truth for anonymized story content after successful script generation.
- `ComicStrip` is the source of truth for user-visible daily output.
- `StoryArc` is the source of truth for recurring narrative continuity.
- `WeeklyIssue` is the source of truth for weekly aggregation and torn-page membership.
- `GenerationJob` is the source of truth for async pipeline state.

Client-side local storage may cache drafts for UX resilience, but it never replaces server records and is never used as the authoritative pipeline input after submission.

## 7. Privacy and Data Lifecycle

### 7.1 Data Classes

1. `Sensitive`
   - Calendar events, task text, reflection text, names, locations, attendees, raw timestamps.
   - May be stored in PostgreSQL for a limited retry/debug window only.
   - May be processed only by services inside DigitalOcean-controlled infrastructure.
   - Must never be sent to external text-model providers.

2. `Anonymized`
   - Comic scripts, fictional characters, scene descriptions, visual prompts, issue summaries.
   - May be stored long-term for continuity and display.
   - May be sent to Gemini for image generation.

3. `Public`
   - Shared strip image, public title, public share page metadata.
   - Stored in Spaces and available via public URL once explicitly shared.

### 7.2 Privacy Boundary

The private fine-tuned script model is the required privacy boundary:

```
[Sensitive raw input] -> [Private fine-tuned script model] -> [Anonymized ComicScript] -> [Gemini image generation]
```

Allowed:

- Sending anonymized `visual_prompt` values to Gemini.
- Storing anonymized scripts and generated images.

Not allowed:

- Sending `DayContext` or `EnrichedDayContext` to Gemini or any external text LLM.
- Sending raw user reflection, real names, real locations, attendee lists, or raw task text to external text-model providers.

### 7.3 Retention and Purge Policy

`DayContext` retention rules:

- Created or refreshed when input is submitted or fetched.
- Kept only for the active generation/retry window.
- Default TTL: 24 hours after job completion or terminal failure.
- Purged by worker cleanup job.

`EnrichedDayContext` retention rules:

- Ephemeral worker-only payload.
- Not exposed via public API.
- Not persisted unless required for short-lived debug snapshots.

Debugging policy:

- Logs may include job IDs, stage names, error codes, and timings.
- Logs must not include raw reflection text, attendee emails, raw event titles, or full task text.

Audit/debug metadata retained after purge:

- Job timestamps.
- Retry counts.
- Failure codes.
- Model version.
- Validation outcome summary.

### 7.4 Anonymization Rules

The private model must transform:

- Real person names -> fictional character names.
- Real locations -> fictionalized or abstract locations.
- Exact dates/times -> narrative time descriptions or omitted timing.
- Task descriptions -> quest-like abstractions.
- Emotional reflection -> preserved tone without revealing identifying detail.

Validation must flag output if:

- Any email pattern appears.
- Any input substring longer than 3 words appears verbatim.
- Any blocked token from the current day's sensitive input appears in `title`, `dialogue`, `scene_description`, or `visual_prompt`.

## 8. Generation Pipeline

### 8.1 Daily Generation Flow

Daily generation is implemented as an async job pipeline:

1. `queued`
   - API accepts the request, resolves idempotency, and creates or reuses a job.

2. `ingesting`
   - Worker fetches Google Calendar and Google Tasks data if needed.
   - Worker merges manual input and writes the latest `DayContext`.

3. `generating_script`
   - Worker builds `EnrichedDayContext`.
   - Worker calls the private fine-tuned model.

4. `validating`
   - Worker validates schema and anonymization constraints.

5. `rendering_panels`
   - Worker calls Gemini with anonymized visual prompts.

6. `composing`
   - Worker composes strip layout, speech bubbles, captions, and title.

7. `storing`
   - Worker uploads assets, writes `ComicStrip`, updates `StoryArc`, and links the strip into the correct `WeeklyIssue`.

8. `ready | failed`
   - Worker marks the terminal state and stores failure metadata if needed.

### 8.2 Stage Contracts

#### Ingesting

- Google Calendar scope: `https://www.googleapis.com/auth/calendar.readonly`
- Google Tasks scope: `https://www.googleapis.com/auth/tasks.readonly`
- Fetch window: local day start to local day end in the user's timezone.
- If Google fetch fails but valid manual input exists, the job may proceed with degraded context and a warning status.
- If both integrations fail and no manual input exists, the job fails with `NO_INPUT_CONTEXT`.

#### Generating Script

- Input: `EnrichedDayContext`
- Output: candidate `ComicScript`
- Performance target: p95 under 10 seconds for the model call
- Required model behavior:
  - valid JSON
  - 4 to 6 panels
  - fictionalized entities only
  - continuity awareness through prior arc hooks and story state

#### Validating

- JSON schema validation is required.
- Anonymization validation is required.
- Character references in panel dialogue must match `characters`.
- `visual_prompt` length must be <= 500 chars.

#### Rendering Panels

- Max 3 concurrent Gemini calls per job.
- Each panel is rendered independently.
- On persistent panel failure, the worker may generate a placeholder panel using caption-only composition.

#### Composing

- 4 panels -> 2x2 grid.
- 5 panels -> 3+2 layout.
- 6 panels -> 2x3 grid.
- Output strip width max 2048px.

#### Storing

- Panel assets path: `users/{user_id}/strips/{date}/panel_{sequence}.png`
- Strip asset path: `users/{user_id}/strips/{date}/strip.png`
- Shared artifact path must be separated from private user paths.

### 8.3 Retry Policy

Retries are stage-specific:

- `generating_script`
  - Up to 3 private retries with stricter format/anonymization instructions.

- `validating`
  - Validation failure sends structured feedback back into another private generation attempt if attempts remain.

- `rendering_panels`
  - Up to 2 retries per failed panel.

- `composing`
  - 1 retry if composition fails due to transient asset-read issues.

No external text-model fallback is allowed for failed private script generation in v1.

### 8.4 Deterministic Fallback

If private script generation exhausts retries:

- The job may fail terminally, or
- The worker may create a deterministic template-based fallback strip from already available anonymized summaries if such a fallback is implemented.

The fallback path must not send raw content to any external text model.

### 8.5 Idempotency and Re-Generation

Rules for `POST /api/day/{date}/generate`:

- If a non-terminal job already exists for the same user/date, return the existing job.
- If a completed strip exists and the user has not consumed the daily regeneration allowance, create a new job with a new `idempotency_key` and link it as a re-generation.
- Max 2 generation attempts per user per date:
  - 1 initial generation
  - 1 explicit regeneration

Immutable outputs:

- A finished `ComicStrip` artifact is immutable once stored.
- Regeneration creates a new strip record and marks the previous one as superseded in metadata if needed.

### 8.6 Queue and Worker Runtime Contract

`GenerationJob` records in PostgreSQL are the only queue source of truth for v1. No external broker is required.

Claim rules:

- Workers may claim only jobs in `queued` or `retry_scheduled`.
- Claim must happen transactionally and only when `lease_expires_at` is null or in the past.
- A successful claim sets `leased_by`, `heartbeat_at`, and `lease_expires_at`, then advances the job into its execution stage.
- At most one active lease may exist for a job at any time.

Lease and heartbeat rules:

- Default lease TTL: `120 seconds`.
- Worker heartbeat interval: every `30 seconds`.
- Each heartbeat extends `lease_expires_at` by another `120 seconds`.
- A job with expired lease is considered abandoned and eligible for recovery sweep.

Duplicate-processing protection:

- A worker must not process any stage without a valid lease.
- Workers must re-check lease ownership before committing terminal or stage-completion mutations.
- Recovery sweep runs every `60 seconds` and may requeue abandoned jobs.

Crash recovery policy:

- Recovery resumes from the nearest safe stage boundary rather than restarting the entire job by default.
- Recovery never resumes from inside a model call or inside an individual Gemini request.
- Stage-boundary persistence is mandatory for any stage that can be resumed without full recomputation.
- After `generating_script`, the candidate `ComicScript` must be persisted before `last_completed_stage` can be advanced to `generating_script`.
- After `rendering_panels`, successfully rendered panel asset paths must be persisted before `last_completed_stage` can be advanced to `rendering_panels`.
- After `composing`, the composed strip asset path must be persisted before `last_completed_stage` can be advanced to `composing`.
- If `last_completed_stage` is:
  - `ingesting`, resume at `generating_script`
  - `generating_script`, resume at `validating`
  - `validating`, restart `validating`
  - `rendering_panels`, rerender only incomplete panels
  - `composing`, restart `composing` after reconciling panel assets
  - `storing`, restart `storing` after reconciling database and storage state

Retry scheduling:

- Transient infrastructure failures move the job to `retry_scheduled`.
- Validation or model hard failures use stage-local retries first and then terminal `failed`.
- Job-level retry backoff: `10s`, `30s`, `90s`, capped at `5 minutes`.
- `next_retry_at` is the authoritative retry timestamp.

Weekly compilation jobs and retroactive generation jobs use the same claim, lease, heartbeat, and recovery contract as daily generation jobs.

## 9. Narrative Engine

### 9.1 StoryArc Rules

- Each user has exactly one active `StoryArc`.
- The protagonist is established on first successful generation.
- The world setting stays stable unless intentionally evolved by the private model over time.
- Active narrative threads are capped at 3.

### 9.2 Daily Continuity Rules

- Yesterday's `arc_hooks.setup_for` is available as today's continuity hint.
- The model should prefer continuity but not require it if the day's input is sparse or unrelated.
- Daily tone may react to reflection mood, but continuity must not override the actual day context.

### 9.3 Weekly Issue Rules

- Exactly one weekly issue per user per ISO week.
- Weekly compilation runs as a separate job.
- Compilation cutoff is Monday 03:00 in the user's timezone for the previous ISO week.
- Any date in the finished week without a strip by cutoff becomes a `TornPage`.

### 9.4 Torn Page Rules

- v1 supports one unlock challenge type: short reflection.
- Unlocking a torn page creates a `retroactive_generation` job for that date.
- When retroactive generation succeeds, the `TornPage` moves to `generated` and links to the new strip.

### 9.5 Weekly Recompilation and Retroactive Update Rules

- Weekly compilation always mutates the existing `weekly_issue_id` for that user and ISO week.
- Re-running weekly compilation for the same week is idempotent.
- Derived fields such as `issue_title`, `arc_summary`, and `cover_image_url` may be overwritten by recompilation.
- `strip_ids` and `torn_page_ids` must remain duplicate-free after recompilation.

If a torn page is unlocked after weekly compilation:

- The system creates a `retroactive_generation` job for that missed date.
- On success, the new strip is inserted into `strip_ids` in chronological order by date.
- The corresponding `TornPage` is transitioned to `generated`.
- `arc_summary` is recomputed.
- `cover_image_url` is regenerated only if cover generation is enabled in the current implementation; otherwise the existing cover remains unchanged.

If retroactive generation fails after unlock:

- The torn page remains eligible for future retry according to its `status`.
- The weekly issue remains in its last successfully compiled form.

Share invalidation rules:

- Strip-level shares remain valid because the strip artifact identity does not change.
- Weekly issue public artifacts, if implemented, must be invalidated and regenerated after recompilation.

## 10. Fine-Tuned Model Specification

### 10.1 Role in v1

The private fine-tuned model is required for v1. It is the core differentiator and the only allowed raw-data text-generation path.

### 10.2 Canonical v1 Training Path

The canonical v1 training path is fixed as follows:

- Primary base model: `Qwen3-8B`
- Fine-tuning mode: supervised fine-tuning with `QLoRA`
- Canonical stack: `transformers`, `datasets`, `TRL`, `PEFT`, `bitsandbytes`
- Training objective: structured transformation from `EnrichedDayContext` to `ComicScript`
- Dataset policy: synthetic-only, English-only
- Inference mode for v1: `non-thinking` only

v1 does not support:

- hybrid thinking/non-thinking training
- reasoning-trace supervision
- fallback to an alternate base model in the spec

### 10.3 Base Model and Serving

- Base model: `Qwen3-8B`
- Checkpoint class: instruct-capable base model suitable for supervised JSON generation
- Fine-tuning adapters: LoRA adapters trained with 4-bit quantization
- Serving stack: `vLLM` or `text-generation-inference`
- Network exposure: VPC-internal only
- Serving behavior: inference requests must run in non-thinking mode for v1 to avoid unstable chain-of-thought-style intermediate output and to maximize structured JSON reliability

### 10.4 Training Example Contract

The canonical training example type is `TrainingExample`.

Fields:

- `id` (string)
- `input` (`EnrichedDayContext`)
- `target` (`ComicScript`)
- `metadata` (object)
  - `persona` (string)
  - `tone` (string)
  - `day_type` (string)
  - `panel_count` (integer)
  - `split` (`train`, `val`, `test`)
  - `source` (`synthetic`)

The canonical learning task is:

```text
Structured JSON input -> Structured JSON output
EnrichedDayContext -> ComicScript
```

The canonical physical storage format is JSONL:

- one `TrainingExample` per line
- UTF-8 encoding
- no comments
- no trailing commas

### 10.5 Dataset Build Artifacts

Every dataset build for v1 must produce these artifacts:

- `train.jsonl`
- `val.jsonl`
- `test.jsonl`
- `dataset_manifest.json`
- `labeling_guidelines.md`
- `eval_curated_subset.jsonl`

`dataset_manifest.json` is represented by `DatasetManifest`:

- `dataset_version` (string)
- `generator_version` (string)
- `generated_at` (timestamp)
- `language` (`en`)
- `source_policy` (`synthetic_only`)
- `counts_by_split` (object)
- `coverage_summary` (object)
  - `personas`
  - `tones`
  - `day_types`
  - `panel_counts`
  - `narrative_modes`

`labeling_guidelines.md` must document:

- how synthetic days are generated
- how fictionalization is enforced
- what makes a target example acceptable
- rejection reasons and curator workflow

### 10.6 Synthetic Dataset Generation Pipeline

The dataset build pipeline for v1 is:

1. Generate synthetic raw daily contexts across varied personas, moods, schedules, and workload shapes.
2. Expand each raw context into `EnrichedDayContext` by adding synthetic continuity state such as protagonist, threads, recurring characters, and weekly context.
3. Generate a target `ComicScript` for each example.
4. Validate input schema and target schema.
5. Validate anonymization and fictionalization constraints.
6. Remove malformed or low-value examples.
7. Run manual curation on a selected subset and any auto-flagged records.
8. Split the dataset into `train`, `val`, and `test`.
9. Export dataset artifacts and manifest.

Generation coverage rules:

- cover multiple personas such as developer, student, manager, parent, freelancer, and creator
- cover day types such as mundane, stressful, productive, celebratory, sparse-input, and recovery-day
- cover narrative tones such as humorous, adventurous, reflective, and chaotic
- cover all supported panel counts from 4 to 6
- include continuity-aware examples and standalone examples

### 10.7 Dataset Quality Rules

Acceptance rules for each example:

- `input` matches `EnrichedDayContext` schema
- `target` matches `ComicScript` schema
- `target.panels` length is between 4 and 6
- no raw-name, raw-location, or email leakage pattern appears in the target
- fictional protagonist and recurring-character behavior is internally consistent
- `visual_prompt` values are usable for image generation and remain under the specified length limit
- the example contains enough daily signal to produce a meaningful comic narrative

Rejection rules:

- malformed JSON in input or target
- repeated or near-duplicate example content
- inconsistent protagonist, thread, or character behavior
- weak anonymization or direct leakage of sensitive-looking tokens
- flat, trivial, or low-information daily contexts
- unusable visual prompts or incoherent panel sequence

Target dataset size for v1:

- `train`: 320-420 examples
- `val`: 40-80 examples
- `test`: 40-80 examples
- `eval_curated_subset`: 20 manually reviewed examples drawn from the `val` and `test` style distribution

### 10.8 Canonical Training Configuration

The canonical v1 training recipe is:

- method: `QLoRA`
- quantization: 4-bit
- target modules: attention and projection layers supported by the chosen Qwen3 checkpoint
- max sequence length: `4096`
- effective batch size: `16` via micro-batch plus gradient accumulation
- per-device micro-batch size: `2`
- gradient accumulation steps: `8`
- learning rate band: `1e-4` to `2e-4`
- lr scheduler: cosine decay with warmup
- warmup ratio: `0.03`
- epochs: `3`
- checkpoint cadence: save every `100` optimization steps and always save the final adapter
- best-checkpoint selection: lowest validation loss among checkpoints that also pass offline JSON/privacy eval on the validation split

The training config snapshot must be retained as an artifact and tied to the released adapter version.

### 10.9 Training Output Artifacts

Each training run must produce:

- adapter weights
- tokenizer/config reference for the exact base checkpoint
- training config snapshot
- dataset version reference
- eval report
- model artifact manifest

`EvalReport` fields:

- `dataset_version` (string)
- `base_model` (string)
- `adapter_version` (string)
- `schema_pass_rate` (number)
- `leakage_pass_rate` (number)
- `panel_count_pass_rate` (number)
- `character_consistency_pass_rate` (number)
- `visual_prompt_length_pass_rate` (number)
- `human_review_summary` (string)
- `release_decision` (`accept`, `reject`)

`ModelArtifactManifest` fields:

- `base_model` (string)
- `adapter_version` (string)
- `training_config_hash` (string)
- `dataset_version` (string)
- `eval_report_path` (string)
- `release_decision` (`accept`, `reject`)
- `released_at` (timestamp or null)

Released model versions must be recorded in `ComicScript.generation_metadata.model_version`.

### 10.10 Evaluation and Release Gate

The v1 release gate is:

1. Offline schema-validity evaluation on the held-out test split.
2. Offline anonymization/leakage evaluation on the held-out test split.
3. Offline checks for panel-count compliance, character consistency, and prompt-length compliance.
4. Human review of the curated eval subset.

Release criteria:

- schema pass rate must be high enough that malformed JSON is treated as rare rather than normal behavior for v1
- leakage pass rate must demonstrate that blocked-token leakage is effectively prevented on the held-out set
- human review must conclude that outputs are narratively acceptable for demo use

Prompt-only baseline comparison is optional and informational. It may be included in the eval report, but it is not a blocking gate for release.

### 10.11 Training-Specific Test Plan

Dataset build checks:

- JSONL files parse successfully
- no split is empty
- no duplicate example IDs across splits
- no overlap in exact example content between `train`, `val`, and `test`
- manifest counts match file contents

Model eval checks:

- parseable JSON rate
- anonymization leakage rate
- panel-count compliance
- character consistency
- prompt-length compliance

Human review scenarios:

- mundane day
- stressful day
- sparse-input day
- continuity day
- recovery / torn-page day

A checkpoint is usable for v1 only if offline checks pass and the curated human review concludes that the strip outputs are narratively acceptable.

## 11. API Specification

### 11.1 Authentication

- Google OAuth 2.0 for sign-in and consent
- Required scopes:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/tasks.readonly`
- API session auth uses a signed JWT stored in an HttpOnly session cookie.
- Authenticated browser requests to `/api/*` rely on the session cookie rather than an `Authorization: Bearer` header in v1.
- Google OAuth credential storage must handle refresh-token replacement when Google returns a newer refresh token.

### 11.2 Endpoints

All `/api/*` endpoints require the authenticated session cookie unless explicitly marked public.

Recommended status codes:

- `200` successful read or idempotent success returning an existing resource
- `201` newly created job, share, or unlock-triggered job
- `400` malformed request
- `401` unauthenticated
- `403` forbidden or ownership violation
- `404` missing resource
- `409` active-job conflict only where the contract chooses not to reuse the existing job
- `422` semantic validation failure

#### User

- `POST /auth/google`
- `GET /auth/callback`
- `GET /api/user/me`
- `PATCH /api/user/preferences`

`PATCH /api/user/preferences`

- Auth: required
- Request body:

```json
{
  "comic_style": "adventure",
  "tone": "humorous",
  "language": "en"
}
```

- Success `200`:

```json
{
  "id": "uuid",
  "preferences": {
    "comic_style": "adventure",
    "tone": "humorous",
    "language": "en"
  }
}
```

- Error `422`:

```json
{
  "error": "Unsupported preference value.",
  "code": "INVALID_PREFERENCES"
}
```

#### Daily Input

`PUT /api/day/{date}/context`

- Auth: required
- Request body (`DailyContextUpsertRequest`):

```json
{
  "manual_todos": [
    { "text": "Ship landing page copy", "completed": true },
    { "text": "Write reflection", "completed": false }
  ],
  "reflection": "Today felt busy but hopeful."
}
```

- Success `200` (`DailyContextResponse`):

```json
{
  "date": "2026-03-10",
  "timezone": "Europe/Uzhgorod",
  "calendar_events": [],
  "todo_items": [
    { "text": "Ship landing page copy", "completed": true, "source": "manual", "due_at": null }
  ],
  "reflection": "Today felt busy but hopeful.",
  "warnings": [],
  "updated_at": "2026-03-10T18:10:00Z"
}
```

- Error `400`:

```json
{
  "error": "Reflection exceeds maximum length.",
  "code": "INVALID_CONTEXT_PAYLOAD"
}
```

`GET /api/day/{date}/context`

- Auth: required
- Success `200` (`DailyContextResponse`):

```json
{
  "date": "2026-03-10",
  "timezone": "Europe/Uzhgorod",
  "calendar_events": [
    {
      "title": "Planning meeting",
      "start_time": "2026-03-10T09:00:00+02:00",
      "end_time": "2026-03-10T10:00:00+02:00",
      "location": "Main office",
      "attendees": ["person@example.com"]
    }
  ],
  "todo_items": [],
  "reflection": "Today felt busy but hopeful.",
  "warnings": ["Google Tasks refresh failed; showing saved manual input."],
  "updated_at": "2026-03-10T18:10:00Z"
}
```

- Error `404`:

```json
{
  "error": "No saved context for this date.",
  "code": "DAY_CONTEXT_NOT_FOUND"
}
```

`POST /api/day/{date}/generate`

- Auth: required
- Request body: empty
- Success `201` for new job or `200` when returning an existing active job:

```json
{
  "job": {
    "id": "uuid",
    "user_id": "uuid",
    "date": "2026-03-10",
    "job_type": "daily_generation",
    "status": "queued",
    "attempt_number": 1,
    "current_stage_retry_count": 0,
    "idempotency_key": "user-id:2026-03-10:1",
    "trigger_source": "user",
    "leased_by": null,
    "lease_expires_at": null,
    "heartbeat_at": null,
    "last_completed_stage": null,
    "next_retry_at": null,
    "error_code": null,
    "error_message": null,
    "result_strip_id": null,
    "result_weekly_issue_id": null,
    "created_at": "2026-03-10T18:10:00Z",
    "updated_at": "2026-03-10T18:10:00Z"
  }
}
```

- Error `422`:

```json
{
  "error": "No usable daily context is available for generation.",
  "code": "NO_INPUT_CONTEXT"
}
```

`GET /api/day/{date}/status`

- Auth: required
- Success `200` (`JobStatusResponse`):

```json
{
  "job": {
    "id": "uuid",
    "user_id": "uuid",
    "date": "2026-03-10",
    "job_type": "daily_generation",
    "status": "rendering_panels",
    "attempt_number": 1,
    "current_stage_retry_count": 0,
    "idempotency_key": "user-id:2026-03-10:1",
    "trigger_source": "user",
    "leased_by": "worker-1",
    "lease_expires_at": "2026-03-10T18:13:00Z",
    "heartbeat_at": "2026-03-10T18:11:30Z",
    "last_completed_stage": "validating",
    "next_retry_at": null,
    "error_code": null,
    "error_message": null,
    "result_strip_id": null,
    "result_weekly_issue_id": null,
    "created_at": "2026-03-10T18:10:00Z",
    "updated_at": "2026-03-10T18:11:30Z"
  },
  "latest_strip": null,
  "warnings": [],
  "can_regenerate": false
}
```

- Error `404`:

```json
{
  "error": "No generation job or strip exists for this date.",
  "code": "STATUS_NOT_FOUND"
}
```

#### Comics

- `GET /api/strips/{date}`
- `GET /api/strips?from={date}&to={date}`
- `GET /api/issues/{iso_week}`
- `GET /api/issues`

#### Torn Pages

- `GET /api/torn-pages`
- `POST /api/torn-pages/{id}/unlock`

`POST /api/torn-pages/{id}/unlock`

- Auth: required
- Request body (`TornPageUnlockRequest`):

```json
{
  "response_text": "I mostly remember being tired but proud that I finished the release."
}
```

- Success `201` (`TornPageUnlockResponse`):

```json
{
  "torn_page_id": "uuid",
  "status": "unlocked",
  "job": {
    "id": "uuid",
    "user_id": "uuid",
    "date": "2026-03-07",
    "job_type": "retroactive_generation",
    "status": "queued",
    "attempt_number": 1,
    "current_stage_retry_count": 0,
    "idempotency_key": "user-id:2026-03-07:retro-1",
    "trigger_source": "torn_page_unlock",
    "leased_by": null,
    "lease_expires_at": null,
    "heartbeat_at": null,
    "last_completed_stage": null,
    "next_retry_at": null,
    "error_code": null,
    "error_message": null,
    "result_strip_id": null,
    "result_weekly_issue_id": null,
    "created_at": "2026-03-10T18:15:00Z",
    "updated_at": "2026-03-10T18:15:00Z"
  }
}
```

- Error `422`:

```json
{
  "error": "This torn page is not eligible for unlock.",
  "code": "TORN_PAGE_NOT_UNLOCKABLE"
}
```

#### Sharing

- `POST /api/strips/{date}/share`
- `DELETE /api/shares/{share_id}`
- `GET /s/{share_id}` (public)

`POST /api/strips/{date}/share`

- Auth: required
- Request body: empty
- Success `201` (`ShareLinkResponse`):

```json
{
  "share_id": "shr_abc123",
  "share_url": "https://dayframe.app/s/shr_abc123",
  "is_active": true,
  "created_at": "2026-03-10T18:16:00Z"
}
```

- Error `404`:

```json
{
  "error": "No strip exists for this date.",
  "code": "STRIP_NOT_FOUND"
}
```

`DELETE /api/shares/{share_id}`

- Auth: required
- Success `200`:

```json
{
  "share_id": "shr_abc123",
  "is_active": false,
  "revoked_at": "2026-03-10T18:20:00Z"
}
```

- Error `403`:

```json
{
  "error": "You do not own this share link.",
  "code": "SHARE_FORBIDDEN"
}
```

### 11.3 Error Contract

All API errors use:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE"
}
```

Recommended machine codes:

- `NO_INPUT_CONTEXT`
- `GOOGLE_AUTH_EXPIRED`
- `GENERATION_IN_PROGRESS`
- `GENERATION_FAILED`
- `ANONYMIZATION_VALIDATION_FAILED`
- `DAY_CONTEXT_NOT_FOUND`
- `STATUS_NOT_FOUND`
- `TORN_PAGE_NOT_UNLOCKABLE`
- `STRIP_NOT_FOUND`
- `SHARE_NOT_FOUND`
- `SHARE_FORBIDDEN`
- `INVALID_CONTEXT_PAYLOAD`
- `INVALID_PREFERENCES`

## 12. Failure Behavior

### 12.1 OAuth and Integration Failures

- If Google refresh fails, the API returns `GOOGLE_AUTH_EXPIRED`.
- The UI must prompt the user to reconnect Google access.
- Manual input remains editable and locally cacheable even when Google auth is expired.

### 12.2 Partial Generation Failures

- If one or more panels fail permanently, the strip may still be composed with placeholder panels if the minimum narrative structure remains understandable.
- If the script never validates, the job fails without external text fallback.

### 12.3 Duplicate Submission Behavior

- Repeated `PUT /context` requests overwrite the saved manual draft for that date.
- Repeated `POST /generate` requests with an active job return the current job.

## 13. Sharing Specification

### 13.1 Share Lifecycle

- Sharing is opt-in per strip.
- Creating a share produces a new `share_id` and public URL.
- Revoking a share invalidates the public route immediately.
- Public shares have no automatic TTL in v1.

### 13.2 Public Surface Rules

Public share pages may expose only:

- strip title
- composed strip image
- generic DayFrame branding text

Public share pages must not expose:

- raw input
- issue internals
- arc metadata beyond what is already visible in the public strip

### 13.3 Media Access Model

Private media rules:

- User panel images and composed strips are stored under private Spaces paths.
- Authenticated user-facing APIs return `PrivateMediaReference` objects with signed URLs.
- Signed URL TTL is `15 minutes`.
- Signed URLs must be issued only for assets owned by the authenticated user.

Public media rules:

- Public share artifacts live under a separate public namespace.
- Public share pages must use only public share artifact URLs and never private signed URLs.
- v1 does not support `public-but-unlisted` private assets.

Storage namespace split:

- Private assets: `users/{user_id}/strips/{date}/...`
- Public shared assets: `public/shares/{share_id}/...`

v1 does not require a backend media proxy. Direct signed URL access is the canonical private-media path.

## 14. Web Client Specification

### 14.1 Technology

- React 18+
- TypeScript
- Vite
- Tailwind CSS
- React Query for server state
- Zustand for local UI state

### 14.2 Required Views

1. `Onboarding`
2. `Daily View`
3. `Comic Viewer`
4. `Weekly Issue`
5. `Library`
6. `Torn Page Unlock`
7. `Share Preview`

### 14.3 Status UX

The client polls `GET /api/day/{date}/status` and maps job states to user-facing copy:

- `queued` -> "Preparing your issue"
- `retry_scheduled` -> "Retrying your issue"
- `ingesting` -> "Collecting your day"
- `generating_script` -> "Writing your comic"
- `validating` -> "Checking privacy and format"
- `rendering_panels` -> "Drawing the panels"
- `composing` -> "Assembling the page"
- `storing` -> "Saving your comic"
- `ready` -> "Your comic is ready"
- `failed` -> "We couldn't finish this issue"

### 14.4 Local Draft Storage

- The client may cache unsent reflection/manual todo drafts in local storage.
- Local draft storage is UX-only and must be overwritten by server-confirmed state after successful sync.

## 15. Infrastructure Specification

### 15.1 Required Services for Demo Day

- App Platform static site for the web client
- App Platform service for the API
- Worker process for queue consumption
- GPU Droplet for the private script model
- Managed PostgreSQL
- Spaces for images and share artifacts

### 15.2 Operational Constraints and Assumptions

- Deployment preference: `DigitalOcean-first` for all core runtime services.
- Hard infrastructure budget for v1 and hackathon demo: `$200`.
- `doctl` is installed and available for operational workflows such as service inspection, rollout checks, and manual demo-day interventions.
- Budget discipline is required when choosing GPU uptime, worker count, and optional stretch features.

### 15.3 Runtime Topology

- `web-client` serves static assets.
- `api-server` handles user traffic and job creation.
- `worker` executes async jobs.
- `gpu-model` serves private inference over VPC only.
- PostgreSQL-backed job records act as the queue source of truth for v1.
- A scheduler process or cron-style worker trigger is responsible for weekly compilation and expired `DayContext` purging.

### 15.4 Runtime Mode

Always-on components:

- `web-client`
- `api-server`
- `worker`
- `managed-postgresql`
- `spaces`

On-demand or workload-driven components:

- `gpu-model` may run continuously for demo reliability or be started ahead of demo windows if cold-start risk is acceptable.
- Weekly compilation jobs run on schedule or via explicit backfill trigger.
- GPU uptime should be minimized when the team is not actively testing, training, or demoing, to stay within the `$200` budget cap.

### 15.5 Networking Rules

- `gpu-model` must not be publicly exposed.
- `api-server` and `worker` may call `gpu-model` over internal networking.
- Only anonymized prompts may leave DigitalOcean for Gemini.

### 15.6 Cost and Budget Guidance

- Budget cap: `$200` total for the hackathon effort.
- Preferred spending priority:
  - 1. GPU for model training and demo-critical inference
  - 2. Managed PostgreSQL
  - 3. App Platform services
  - 4. Spaces storage and bandwidth
- Cost-saving defaults:
  - keep only core web/API/database/storage services always on
  - avoid unnecessary parallel GPU experiments in v1
  - treat optional features that increase inference or storage costs as stretch work

### 15.7 Acceptance vs Nice-to-Have Targets

Acceptance criteria:

- End-to-end daily generation completes successfully in normal conditions.
- Raw user text never leaves the private text-generation boundary.
- Weekly compilation and torn-page creation function for at least one demo week.

Nice-to-have targets:

- End-to-end pipeline under 60 seconds
- Push/email notification
- Auto-scaling or advanced queue observability

### 15.8 External References

- DigitalOcean DevPost resources: [digitalocean.devpost.com/resources](https://digitalocean.devpost.com/resources)
- `doctl` CLI documentation should be treated as the canonical operator reference for CLI-based deployment and inspection workflows.

## 16. Validation and Acceptance Scenarios

The revised implementation is acceptable only if these scenarios are covered:

1. `Happy path`
   - User signs in, imports Calendar and Tasks, adds reflection, generates a strip, and views it.

2. `Privacy path`
   - Raw names, locations, and attendee data do not appear in `ComicScript` or Gemini requests.

3. `Retry path`
   - Invalid or deanonymized script output triggers private retries and either succeeds or fails cleanly.

4. `Partial render path`
   - One panel render failure still allows a composed strip using placeholder rules.

5. `Narrative continuity`
   - Day N+1 uses protagonist and open thread context from day N.

6. `Weekly compilation`
   - A completed week becomes a weekly issue with missing dates converted to torn pages.

7. `Torn page unlock`
   - User submits a reflection challenge and receives a retroactive strip job.

8. `Sharing`
   - Public share page exposes only the final strip artifact and can be revoked.

9. `OAuth recovery`
   - Expired Google auth produces a recoverable state without corrupting saved manual input.

### 16.1 Queue and Runtime State-Transition Matrix

- Only one worker may successfully claim a job lease at a time.
- A worker heartbeat extends the lease without changing job ownership.
- An abandoned lease is detected by the recovery sweep and the job becomes recoverable.
- Recovery resumes from the nearest safe stage boundary rather than from the beginning by default.
- Job-level retry scheduling respects `10s`, `30s`, `90s`, capped at `5m`.
- Weekly compilation jobs and retroactive generation jobs follow the same lease and retry rules as daily generation jobs.

### 16.2 API Conformance Matrix

- `PATCH /api/user/preferences` validates supported enum values and returns updated preferences.
- `PUT /api/day/{date}/context` upserts manual draft data and overwrites the prior draft for the same date.
- `GET /api/day/{date}/context` returns merged saved context plus warnings when external fetches degrade.
- `POST /api/day/{date}/generate` creates a new job when eligible and reuses the active job when one already exists.
- `GET /api/day/{date}/status` returns the current job, latest strip summary when available, warnings, and `can_regenerate`.
- `POST /api/torn-pages/{id}/unlock` creates a retroactive generation job only for eligible torn pages.
- `POST /api/strips/{date}/share` creates a new share artifact for an existing strip.
- `DELETE /api/shares/{share_id}` revokes the share immediately and prevents future public resolution.

### 16.3 Weekly Lifecycle Matrix

- A missing day becomes a torn page at the weekly compilation cutoff.
- Retroactive generation inserts the completed strip into the compiled weekly issue in chronological date order.
- Recompiling the same weekly issue mutates the existing `weekly_issue_id` rather than creating a duplicate.
- Recompilation does not duplicate `strip_ids` or `torn_page_ids`.
- A failed retroactive generation does not corrupt the previously compiled weekly issue.

### 16.4 Asset Access Matrix

- Authenticated private strip retrieval returns signed URLs rather than public asset URLs.
- Signed URLs expire after `15 minutes`.
- Public share pages expose only public share artifact paths.
- Revoked share URLs no longer resolve to public strip artifacts.

### 16.5 Definition of Done

For v1, `done` means:

- all documented endpoint behaviors are implemented with the specified success and error semantics, or
- any intentionally omitted behavior is explicitly marked out of scope in the shipped spec and implementation notes.

## 17. Implementation Checklist

### 17.1 Required for v1

- Google OAuth with Calendar and Tasks scopes
- Manual todos and reflection input
- `DayContext` persistence with TTL and purge
- Async `GenerationJob` pipeline
- PostgreSQL-backed queue with lease, heartbeat, and recovery sweep
- Private fine-tuned script model deployment
- Schema and anonymization validation
- Gemini panel rendering from anonymized prompts
- Strip composition and Spaces upload
- Signed URL issuance for private media
- StoryArc updates
- Weekly issue compilation
- In-place weekly recompilation after successful retroactive strip generation
- Torn-page reflection unlock
- Example-first API contract with documented request/response payloads
- Public strip sharing and revocation

### 17.2 Stretch

- Weekly issue cover image
- Notifications
- Additional art-style presets
- Richer weekly summary visuals

## 18. Roadmap

- Additional integrations
- Mobile/PWA experience
- Self-hosted or custom fine-tuned image generation
- Multi-language support
- Advanced torn-page mechanics
- Subscription model
