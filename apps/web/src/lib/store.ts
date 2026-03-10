import { create } from "zustand";

type TodoDraft = {
  id: string;
  text: string;
  completed: boolean;
};

type DraftState = {
  selectedDate: string;
  reflection: string;
  todos: TodoDraft[];
  hydratedForDate: string | null;
  setSelectedDate: (value: string) => void;
  setReflection: (value: string) => void;
  updateTodo: (id: string, updates: Partial<TodoDraft>) => void;
  addTodo: () => void;
  removeTodo: (id: string) => void;
  hydrate: (date: string, reflection: string | null, todos: TodoDraft[]) => void;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function createTodo(): TodoDraft {
  return {
    id: crypto.randomUUID(),
    text: "",
    completed: false
  };
}

export const useDailyDraftStore = create<DraftState>((set, get) => ({
  selectedDate: today(),
  reflection: "",
  todos: [createTodo()],
  hydratedForDate: null,
  setSelectedDate: (value) =>
    set({
      selectedDate: value,
      hydratedForDate: null
    }),
  setReflection: (value) => set({ reflection: value }),
  updateTodo: (id, updates) =>
    set({
      todos: get().todos.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo))
    }),
  addTodo: () => set({ todos: [...get().todos, createTodo()] }),
  removeTodo: (id) => {
    const next = get().todos.filter((todo) => todo.id !== id);
    set({ todos: next.length > 0 ? next : [createTodo()] });
  },
  hydrate: (date, reflection, todos) =>
    set({
      selectedDate: date,
      reflection: reflection ?? "",
      todos: todos.length > 0 ? todos : [createTodo()],
      hydratedForDate: date
    })
}));
