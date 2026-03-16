import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import { StatusBadge } from "./components/StatusBadge";
import { api } from "./lib/api";
import { useDailyDraftStore } from "./lib/store";

const queryClient = new QueryClient();

type View = "daily" | "library" | "issues" | "torn-pages";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function toIsoWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  const weekday = value.getUTCDay() || 7;

  value.setUTCDate(value.getUTCDate() + 4 - weekday);

  const isoYear = value.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

function AppShell() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("daily");
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [unlockDrafts, setUnlockDrafts] = useState<Record<string, string>>({});
  const {
    selectedDate,
    reflection,
    todos,
    hydratedForDate,
    setSelectedDate,
    setReflection,
    updateTodo,
    addTodo,
    removeTodo,
    hydrate
  } = useDailyDraftStore();

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.getMe,
    retry: false
  });

  const contextQuery = useQuery({
    queryKey: ["context", selectedDate],
    queryFn: () => api.getContext(selectedDate),
    enabled: sessionQuery.isSuccess,
    retry: false
  });

  const statusQuery = useQuery({
    queryKey: ["status", selectedDate],
    queryFn: () => api.getStatus(selectedDate),
    enabled: sessionQuery.isSuccess,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.job && !["ready", "failed"].includes(query.state.data.job.status) ? 1500 : false
  });

  const stripQuery = useQuery({
    queryKey: ["strip", selectedDate],
    queryFn: () => api.getStrip(selectedDate),
    enabled: sessionQuery.isSuccess && statusQuery.data?.job?.status === "ready",
    retry: false
  });

  const stripsQuery = useQuery({
    queryKey: ["strips", "library"],
    queryFn: () => api.listStrips(isoDate(-30), isoDate(7)),
    enabled: sessionQuery.isSuccess && view === "library"
  });

  const issuesQuery = useQuery({
    queryKey: ["issues"],
    queryFn: api.listIssues,
    enabled: sessionQuery.isSuccess && (view === "issues" || view === "torn-pages")
  });

  const issueQuery = useQuery({
    queryKey: ["issue", selectedIssue],
    queryFn: () => api.getIssue(selectedIssue!),
    enabled: sessionQuery.isSuccess && view === "issues" && Boolean(selectedIssue)
  });

  const tornPagesQuery = useQuery({
    queryKey: ["torn-pages"],
    queryFn: api.listTornPages,
    enabled: sessionQuery.isSuccess && view === "torn-pages"
  });

  useEffect(() => {
    if (!selectedIssue && issuesQuery.data && issuesQuery.data.length > 0) {
      setSelectedIssue(issuesQuery.data[0]!.iso_week);
    }
  }, [issuesQuery.data, selectedIssue]);

  useEffect(() => {
    if (view !== "issues" || !issuesQuery.data || issuesQuery.data.length === 0) {
      return;
    }

    const matchingIssue = issuesQuery.data.find((issue) => issue.iso_week === toIsoWeek(selectedDate));
    if (matchingIssue && selectedIssue !== matchingIssue.iso_week) {
      setSelectedIssue(matchingIssue.iso_week);
    }
  }, [issuesQuery.data, selectedDate, selectedIssue, view]);

  useEffect(() => {
    if (statusQuery.data?.job?.status === "ready") {
      queryClient.invalidateQueries({ queryKey: ["strip", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["strips", "library"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["torn-pages"] });
    }
  }, [queryClient, selectedDate, statusQuery.data?.job?.status]);

  useEffect(() => {
    if (contextQuery.data && hydratedForDate !== selectedDate) {
      hydrate(
        selectedDate,
        contextQuery.data.reflection,
        contextQuery.data.todo_items.map((todo) => ({
          id: crypto.randomUUID(),
          text: todo.text,
          completed: todo.completed
        }))
      );
    }
  }, [contextQuery.data, hydrate, hydratedForDate, selectedDate]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveContext(selectedDate, {
        manual_todos: todos.filter((todo) => todo.text.trim().length > 0).map((todo) => ({
          text: todo.text.trim(),
          completed: todo.completed
        })),
        reflection: reflection.trim() ? reflection.trim() : null
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(["context", selectedDate], payload);
      queryClient.invalidateQueries({ queryKey: ["status", selectedDate] });
    }
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generate(selectedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["strips", "library"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["torn-pages"] });
    }
  });

  const shareMutation = useMutation({
    mutationFn: () => api.createShare(selectedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strip", selectedDate] });
    }
  });

  const revokeShareMutation = useMutation({
    mutationFn: (shareId: string) => api.revokeShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strip", selectedDate] });
    }
  });

  const unlockMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.unlockTornPage(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["torn-pages"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      if (selectedIssue) {
        queryClient.invalidateQueries({ queryKey: ["issue", selectedIssue] });
      }
    }
  });

  const signedStripUrl = stripQuery.data?.media.find((media) => media.asset_type === "composed_strip")?.signed_url;

  const notice = useMemo(() => {
    if (generateMutation.isSuccess) {
      return "Generation queued. The worker is building your issue now.";
    }

    if (saveMutation.isSuccess) {
      return "Context saved. Your day is ready for generation.";
    }

    if (shareMutation.isSuccess) {
      return "Public share created.";
    }

    if (revokeShareMutation.isSuccess) {
      return "Public share revoked.";
    }

    if (unlockMutation.isSuccess) {
      return "Torn page unlocked and retroactive generation queued.";
    }

    if (statusQuery.data?.job?.error_message) {
      return statusQuery.data.job.error_message;
    }

    return null;
  }, [
    generateMutation.isSuccess,
    revokeShareMutation.isSuccess,
    saveMutation.isSuccess,
    shareMutation.isSuccess,
    statusQuery.data?.job?.error_message,
    unlockMutation.isSuccess
  ]);

  if (sessionQuery.isPending) {
    return <div className="mx-auto max-w-5xl px-6 py-16 text-stone-700">Loading DayFrame…</div>;
  }

  if (sessionQuery.isError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <section className="rounded-[2rem] border border-white/60 bg-white/80 p-8 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-700">DayFrame v1 scaffold</p>
          <h1 className="mt-4 max-w-2xl font-serif text-5xl text-stone-900">Turn a real day into a curious little comic.</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-stone-700">
            Sign in, save context, generate a strip, revisit your weekly issue, unlock torn pages, and share finished pages.
          </p>
          <form action={`${api.baseUrl}/auth/google`} method="post" className="mt-8">
            <button className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700">
              Sign in with Google
            </button>
          </form>
          <p className="mt-4 text-sm text-stone-500">Local development falls back to a mock Google callback when real OAuth credentials are not configured.</p>
        </section>
      </main>
    );
  }

  const views: Array<{ id: View; label: string }> = [
    { id: "daily", label: "Daily" },
    { id: "library", label: "Library" },
    { id: "issues", label: "Weekly Issues" },
    { id: "torn-pages", label: "Torn Pages" }
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-700">DayFrame</p>
            <h1 className="mt-3 font-serif text-4xl text-stone-900">Hello, {sessionQuery.data.display_name}.</h1>
            <p className="mt-2 max-w-2xl text-stone-600">The full Agent 1 scaffold now includes daily issues, a library, weekly compilation, torn-page recovery, and strip sharing.</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  view === item.id ? "bg-stone-900 text-white" : "border border-stone-300 bg-stone-50 text-stone-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {notice ? (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-stone-700">
          {notice}
        </div>
      ) : null}

      {view === "daily" ? (
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_64px_rgba(120,53,15,0.1)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Context</p>
                <h2 className="mt-2 font-serif text-3xl text-stone-900">What happened today?</h2>
              </div>
              <StatusBadge status={statusQuery.data?.job?.status} />
            </div>

            <label className="mt-6 flex flex-col gap-2 text-sm text-stone-600">
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900"
              />
            </label>

            <label className="mt-6 block text-sm font-medium text-stone-700">
              Reflection
              <textarea
                value={reflection}
                onChange={(event) => setReflection(event.target.value)}
                rows={6}
                placeholder="Write a short reflection about the day."
                className="mt-3 w-full rounded-[1.5rem] border border-stone-300 bg-stone-50 px-4 py-4 text-stone-900 outline-none transition focus:border-amber-500"
              />
            </label>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-700">Manual todos</p>
                <button type="button" onClick={addTodo} className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
                  Add todo
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {todos.map((todo) => (
                  <div key={todo.id} className="flex gap-3 rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={(event) => updateTodo(todo.id, { completed: event.target.checked })}
                      className="mt-1 size-5 rounded border-stone-300"
                    />
                    <input
                      value={todo.text}
                      onChange={(event) => updateTodo(todo.id, { text: event.target.value })}
                      placeholder="Add a concrete thing you touched today."
                      className="flex-1 bg-transparent text-stone-900 outline-none"
                    />
                    <button type="button" onClick={() => removeTodo(todo.id)} className="text-sm text-stone-500">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : "Save context"}
              </button>
              <button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-stone-900 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {generateMutation.isPending ? "Queueing…" : "Generate issue"}
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-900/10 bg-stone-950 px-6 py-6 text-stone-50 shadow-[0_24px_64px_rgba(15,23,42,0.24)]">
            <p className="text-sm uppercase tracking-[0.25em] text-amber-300">Comic Viewer</p>
            <h2 className="mt-2 font-serif text-3xl">Latest issue for {selectedDate}</h2>

            {stripQuery.isSuccess && signedStripUrl ? (
              <div className="mt-6 space-y-5">
                <img src={signedStripUrl} alt={stripQuery.data.title} className="w-full rounded-[1.5rem] border border-white/10 bg-white/5" />
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <p className="text-lg font-semibold">{stripQuery.data.title}</p>
                  <p className="mt-2 text-sm text-stone-300">{stripQuery.data.tone}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {stripQuery.data.share ? (
                      <>
                        <a
                          href={stripQuery.data.share.share_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-200"
                        >
                          Open share preview
                        </a>
                        <button
                          type="button"
                          onClick={() => revokeShareMutation.mutate(stripQuery.data.share!.share_id)}
                          className="rounded-full border border-white/20 px-4 py-2 text-sm text-stone-200"
                        >
                          Revoke share
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => shareMutation.mutate()}
                        className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-200"
                      >
                        Create public share
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/15 bg-white/5 p-6 text-sm leading-7 text-stone-300">
                The strip will appear here once the worker reaches <code className="rounded bg-white/10 px-2 py-1">ready</code>.
              </div>
            )}
          </section>
        </div>
      ) : null}

      {view === "library" ? (
        <section className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_64px_rgba(120,53,15,0.1)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Library</p>
          <h2 className="mt-2 font-serif text-3xl text-stone-900">Recent strips</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {(stripsQuery.data ?? []).map((strip) => (
              <article key={strip.id} className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-700">{strip.date}</p>
                <h3 className="mt-2 font-serif text-2xl text-stone-900">{strip.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{strip.tone}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(strip.date);
                    setView("daily");
                  }}
                  className="mt-4 rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700"
                >
                  Open in daily view
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "issues" ? (
        <div className="grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
          <section className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_64px_rgba(120,53,15,0.1)] backdrop-blur">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Weekly Issues</p>
            <h2 className="mt-2 font-serif text-3xl text-stone-900">Compiled chapters</h2>
            <div className="mt-6 space-y-3">
              {(issuesQuery.data ?? []).map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => setSelectedIssue(issue.iso_week)}
                  className={`w-full rounded-[1.5rem] border px-4 py-4 text-left ${
                    selectedIssue === issue.iso_week ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-stone-50 text-stone-800"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.2em]">{issue.iso_week}</p>
                  <p className="mt-2 font-serif text-xl">Week of {issue.week_start}</p>
                  <p className="mt-2 text-sm">{issue.status} · {issue.strip_ids.length} strips · {issue.torn_page_ids.length} missing chapters</p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-900/10 bg-stone-950 px-6 py-6 text-stone-50 shadow-[0_24px_64px_rgba(15,23,42,0.24)]">
            {issueQuery.data ? (
              <>
                <p className="text-sm uppercase tracking-[0.25em] text-amber-300">{issueQuery.data.iso_week}</p>
                <h2 className="mt-2 font-serif text-3xl">{issueQuery.data.issue_title}</h2>
                <p className="mt-4 text-sm leading-7 text-stone-300">{issueQuery.data.arc_summary}</p>
                <div className="mt-6 grid gap-4">
                  {issueQuery.data.strips.map((strip) => (
                    <article key={strip.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{strip.date}</p>
                      <p className="mt-2 text-lg">{strip.title}</p>
                    </article>
                  ))}
                  {issueQuery.data.torn_pages.map((page) => (
                    <article key={page.id} className="rounded-[1.5rem] border border-amber-400/20 bg-amber-200/10 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{page.date}</p>
                      <p className="mt-2 text-lg">Torn page · {page.status}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-stone-300">Select a weekly issue to inspect it.</div>
            )}
          </section>
        </div>
      ) : null}

      {view === "torn-pages" ? (
        <section className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_64px_rgba(120,53,15,0.1)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Torn Pages</p>
          <h2 className="mt-2 font-serif text-3xl text-stone-900">Recover missed chapters</h2>
          <div className="mt-6 space-y-4">
            {(tornPagesQuery.data ?? []).map((page) => (
              <article key={page.id} className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-700">{page.date}</p>
                    <p className="mt-2 text-lg font-semibold text-stone-900">{page.status}</p>
                    <p className="mt-2 text-sm text-stone-600">{page.unlock_challenge.prompt}</p>
                  </div>
                  {page.status === "generated" && page.retroactive_strip_id ? (
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">Recovered</span>
                  ) : null}
                </div>
                {page.status !== "generated" ? (
                  <div className="mt-4 flex flex-col gap-3">
                    <textarea
                      value={unlockDrafts[page.id] ?? page.unlock_response ?? ""}
                      onChange={(event) => setUnlockDrafts((current) => ({ ...current, [page.id]: event.target.value }))}
                      rows={4}
                      className="w-full rounded-[1.25rem] border border-stone-300 bg-white px-4 py-3 text-stone-900"
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => unlockMutation.mutate({ id: page.id, text: unlockDrafts[page.id] ?? "" })}
                        disabled={unlockMutation.isPending}
                        className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Unlock torn page
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
