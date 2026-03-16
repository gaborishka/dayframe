import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";

import type { CalendarEvent, TodoItem } from "@dayframe/contracts";
import type { ApiEnv } from "@dayframe/config";

import { getDb, users } from "../db/index.js";
import { decryptSecret, encryptSecret } from "../services/auth.js";

type GoogleSyncResult = {
  calendarEvents: CalendarEvent[];
  taskItems: TodoItem[];
  warnings: string[];
  sourceStatus: {
    calendar_fetch_status: "pending" | "ok" | "failed" | "skipped";
    tasks_fetch_status: "pending" | "ok" | "failed" | "skipped";
  };
};

function hasGoogleTokens(user: typeof users.$inferSelect) {
  return Boolean(user.googleAccessToken || user.googleRefreshToken);
}

async function refreshAccessToken(user: typeof users.$inferSelect, env: ApiEnv) {
  if (!user.googleRefreshToken) {
    throw new Error("GOOGLE_AUTH_EXPIRED");
  }

  const refreshToken = decryptSecret(user.googleRefreshToken, env.JWT_SECRET);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error("GOOGLE_AUTH_EXPIRED");
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  const encryptedAccess = encryptSecret(payload.access_token, env.JWT_SECRET);
  const expiresAt = new Date(Date.now() + payload.expires_in * 1000);

  await getDb()
    .update(users)
    .set({
      googleAccessToken: encryptedAccess,
      googleTokenExpiresAt: expiresAt
    })
    .where(eq(users.id, user.id));

  return payload.access_token;
}

async function getAccessToken(user: typeof users.$inferSelect, env: ApiEnv) {
  if (!hasGoogleTokens(user)) {
    return null;
  }

  if (
    user.googleAccessToken &&
    user.googleTokenExpiresAt &&
    user.googleTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptSecret(user.googleAccessToken, env.JWT_SECRET);
  }

  return refreshAccessToken(user, env);
}

async function fetchCalendarEvents(accessToken: string, date: string, timezone: string): Promise<CalendarEvent[]> {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf("day").toUTC().toISO();
  const end = DateTime.fromISO(date, { zone: timezone }).endOf("day").toUTC().toISO();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", start ?? "");
  url.searchParams.set("timeMax", end ?? "");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("GOOGLE_CALENDAR_FAILED");
  }

  const payload = (await response.json()) as {
    items?: Array<{
      summary?: string;
      location?: string;
      attendees?: Array<{ email?: string }>;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  return (payload.items ?? []).map((event) => ({
    title: event.summary ?? "Untitled event",
    start_time: event.start?.dateTime ?? `${event.start?.date}T00:00:00.000Z`,
    end_time: event.end?.dateTime ?? `${event.end?.date}T23:59:59.000Z`,
    location: event.location ?? null,
    attendees: (event.attendees ?? []).map((attendee) => attendee.email ?? "").filter(Boolean)
  }));
}

async function fetchTaskItems(accessToken: string): Promise<TodoItem[]> {
  const tasklistsResponse = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!tasklistsResponse.ok) {
    throw new Error("GOOGLE_TASKS_FAILED");
  }

  const tasklistsPayload = (await tasklistsResponse.json()) as {
    items?: Array<{ id: string }>;
  };

  const tasklists = tasklistsPayload.items ?? [];
  const collected: TodoItem[] = [];

  for (const tasklist of tasklists.slice(0, 5)) {
    const tasksResponse = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${tasklist.id}/tasks?showCompleted=true&showHidden=false`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!tasksResponse.ok) {
      throw new Error("GOOGLE_TASKS_FAILED");
    }

    const tasksPayload = (await tasksResponse.json()) as {
      items?: Array<{ title?: string; status?: string; due?: string }>;
    };

    for (const task of tasksPayload.items ?? []) {
      if (!task.title) {
        continue;
      }

      collected.push({
        text: task.title,
        completed: task.status === "completed",
        source: "google_tasks",
        due_at: task.due ?? null
      });
    }
  }

  return collected;
}

export async function syncGoogleDaySources(
  userId: string,
  date: string,
  timezone: string,
  env: ApiEnv
): Promise<GoogleSyncResult> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user || !hasGoogleTokens(user) || !env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.includes("your-google-client-id")) {
    return {
      calendarEvents: [],
      taskItems: [],
      warnings: [],
      sourceStatus: {
        calendar_fetch_status: "skipped",
        tasks_fetch_status: "skipped"
      }
    };
  }

  try {
    const accessToken = await getAccessToken(user, env);

    if (!accessToken) {
      return {
        calendarEvents: [],
        taskItems: [],
        warnings: [],
        sourceStatus: {
          calendar_fetch_status: "skipped",
          tasks_fetch_status: "skipped"
        }
      };
    }

    const [calendarEvents, taskItems] = await Promise.all([
      fetchCalendarEvents(accessToken, date, timezone),
      fetchTaskItems(accessToken)
    ]);

    return {
      calendarEvents,
      taskItems,
      warnings: [],
      sourceStatus: {
        calendar_fetch_status: "ok",
        tasks_fetch_status: "ok"
      }
    };
  } catch (error) {
    const warning =
      error instanceof Error && error.message === "GOOGLE_AUTH_EXPIRED"
        ? "Google authorization expired. Reconnect to sync Calendar and Tasks."
        : "Google sync failed; continuing with saved manual input.";

    return {
      calendarEvents: [],
      taskItems: [],
      warnings: [warning],
      sourceStatus: {
        calendar_fetch_status: "failed",
        tasks_fetch_status: "failed"
      }
    };
  }
}
