const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-dayframe-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorPayload.error || "Request failed");
  }

  return response.json() as Promise<T>;
}

export type UserMe = {
  id: string;
  email: string;
  display_name: string;
  preferences: {
    comic_style: string;
    tone: string;
    language: string;
  };
};

export type DailyContextResponse = {
  date: string;
  timezone: string;
  calendar_events: Array<{
    title: string;
    start_time: string;
    end_time: string;
    location: string | null;
    attendees: string[];
  }>;
  todo_items: Array<{
    text: string;
    completed: boolean;
    source: "google_tasks" | "manual";
    due_at: string | null;
  }>;
  reflection: string | null;
  warnings: string[];
  updated_at: string;
};

export type JobStatusResponse = {
  job: {
    id: string;
    status: string;
    attempt_number: number;
    leased_by: string | null;
    error_message: string | null;
  } | null;
  latest_strip: {
    id: string;
    title: string;
    tone: string;
  } | null;
  warnings: string[];
  can_regenerate: boolean;
};

export type StripResponse = {
  id: string;
  date: string;
  title: string;
  tone: string;
  panels: Array<{
    sequence: number;
    scene_description: string;
    dialogue: Array<{ speaker: string; text: string }>;
    visual_prompt: string;
    mood: string;
    narrative_caption: string | null;
  }>;
  media: Array<{
    asset_type: "composed_strip" | "panel_image" | "weekly_cover";
    signed_url: string;
    expires_at: string;
  }>;
};

export const api = {
  baseUrl: API_BASE_URL,
  getMe() {
    return request<UserMe>("/api/user/me");
  },
  getContext(date: string) {
    return request<DailyContextResponse>(`/api/day/${date}/context`);
  },
  saveContext(
    date: string,
    payload: {
      manual_todos: Array<{ text: string; completed: boolean }>;
      reflection: string | null;
    }
  ) {
    return request<DailyContextResponse>(`/api/day/${date}/context`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  generate(date: string) {
    return request<{ job: { id: string; status: string } }>(`/api/day/${date}/generate`, {
      method: "POST"
    });
  },
  getStatus(date: string) {
    return request<JobStatusResponse>(`/api/day/${date}/status`);
  },
  getStrip(date: string) {
    return request<StripResponse>(`/api/strips/${date}`);
  }
};
