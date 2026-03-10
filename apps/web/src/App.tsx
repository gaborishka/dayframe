import { useEffect, useMemo } from "react";
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

function AppShell() {
  const queryClient = useQueryClient();
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
    }
  });

  const signedStripUrl = stripQuery.data?.media.find((media) => media.asset_type === "composed_strip")?.signed_url;

  const notice = useMemo(() => {
    if (saveMutation.isSuccess) {
      return "Context saved. Your day is ready for generation.";
    }

    if (generateMutation.isSuccess) {
      return "Generation queued. The worker is building your issue now.";
    }

    if (statusQuery.data?.job?.error_message) {
      return statusQuery.data.job.error_message;
    }

    return null;
  }, [generateMutation.isSuccess, saveMutation.isSuccess, statusQuery.data?.job?.error_message]);

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
            This first slice is focused on the async daily loop: sign in, save context, queue generation, and watch a private strip arrive.
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-amber-700">Daily View</p>
          <h1 className="mt-3 font-serif text-4xl text-stone-900">Hello, {sessionQuery.data.display_name}.</h1>
          <p className="mt-2 max-w-2xl text-stone-600">Capture the day, queue the issue, and let the worker move it through the private script boundary.</p>
        </div>
        <label className="flex flex-col gap-2 text-sm text-stone-600">
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900"
          />
        </label>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_64px_rgba(120,53,15,0.1)] backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Context</p>
              <h2 className="mt-2 font-serif text-3xl text-stone-900">What happened today?</h2>
            </div>
            <StatusBadge status={statusQuery.data?.job?.status} />
          </div>

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

          {notice ? <p className="mt-4 text-sm text-stone-600">{notice}</p> : null}
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
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/15 bg-white/5 p-6 text-sm leading-7 text-stone-300">
              The strip will appear here once the worker reaches <code className="rounded bg-white/10 px-2 py-1">ready</code>.
            </div>
          )}

          {stripQuery.data?.panels ? (
            <div className="mt-6 space-y-3">
              {stripQuery.data.panels.map((panel) => (
                <article key={panel.sequence} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Panel {panel.sequence}</p>
                  <p className="mt-2 text-base text-white">{panel.scene_description}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
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
