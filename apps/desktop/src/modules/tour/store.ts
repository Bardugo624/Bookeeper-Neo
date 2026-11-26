import { useEffect } from 'react';
import { create } from 'zustand';
import { useSession } from '../../session';
import { advance, EMPTY_SNAPSHOT, MAX_STEPS, type TourNote, type TourPath, type TourSnapshot, type TourStep } from './model';
import { loadTour, saveTour } from './storage';

interface TourStore extends TourSnapshot {
  /** The connection the state belongs to, `null` before the shell binds it. */
  connectionId: string | null;
  /** Bumped when a new path is registered, so views of the path re-render. */
  registryVersion: number;
  /** Something the card says once; not remembered. */
  note: TourNote | null;
  /** Signals seen during the current step that were not the step's own; not remembered. */
  seen: readonly string[];
  setNote(note: TourNote | null): void;
  bind(connectionId: string | null): void;
  start(path: TourPath, options?: { replay?: boolean }): void;
  pause(): void;
  resume(): void;
  skip(): void;
  signal(name: string, data?: unknown): void;
}

// Paths hold functions, so only their id is stored; whoever offers a path registers it.
const paths = new Map<string, TourPath>();

export function registerTourPath(path: TourPath): void {
  if (path.steps.length === 0 || path.steps.length > MAX_STEPS) {
    throw new Error(`tour path "${path.id}" must have between 1 and ${MAX_STEPS} steps`);
  }
  const isNew = !paths.has(path.id);
  paths.set(path.id, path);
  // The registry is not state: a newly known path (e.g. after a restart) must wake its viewers.
  if (isNew) useTourStore.setState((s) => ({ registryVersion: s.registryVersion + 1 }));
}

const INITIAL = { ...EMPTY_SNAPSHOT, connectionId: null as string | null, registryVersion: 0, note: null as TourNote | null, seen: [] as readonly string[] };

/** Wakes the viewers of paths after something a path depends on changed (e.g. a phone can be paired). */
export function touchTourPaths(): void {
  useTourStore.setState((s) => ({ registryVersion: s.registryVersion + 1 }));
}

export const useTourStore = create<TourStore>((set, get) => {
  /** Applies a change and remembers it for the connection. */
  const commit = (next: Partial<TourSnapshot>) => {
    set(next);
    const s = get();
    if (s.connectionId) saveTour(s.connectionId, { pathId: s.pathId, step: s.step, status: s.status });
  };
  const toStatus = (from: TourSnapshot['status'], to: TourSnapshot['status']) => {
    if (get().status === from) commit({ status: to });
  };

  return {
    ...INITIAL,

    setNote: (note) => set({ note }),

    bind(connectionId) {
      if (get().connectionId === connectionId && connectionId !== null) return;
      set({ connectionId, ...(connectionId ? loadTour(connectionId) : EMPTY_SNAPSHOT) });
    },

    start(path, options) {
      registerTourPath(path);
      // A flow may start the tour before the shell has bound the connection.
      if (!get().connectionId) get().bind(useSession.getState().connection?.id ?? null);
      const s = get();
      // Finished or skipped never comes back, unless the person asks to see it again.
      if ((s.status === 'done' || s.status === 'skipped') && !options?.replay) return;
      if (s.status === 'running' || s.status === 'paused') {
        if (s.pathId === path.id && !options?.replay) return;
      }
      set({ seen: [] });
      commit({ pathId: path.id, step: 0, status: 'running' });
    },

    pause() {
      set({ note: null });
      toStatus('running', 'paused');
    },
    resume: () => toStatus('paused', 'running'),

    skip() {
      const { status } = get();
      set({ note: null });
      if (status === 'running' || status === 'paused') commit({ status: 'skipped' });
    },

    signal(name, data) {
      const s = get();
      const step = currentStep(s);
      if (!step) return;
      // A signal the step takes while paused brings the tour back first.
      if (s.status === 'paused' && step.whilePaused && step.signal === name && (!step.accept || step.accept(data))) {
        commit({ status: 'running' });
        get().signal(name, data);
        return;
      }
      if (s.status !== 'running') return;
      if (step.signal !== name) {
        // Not the step's end, but the step may move its light because of it.
        if (!s.seen.includes(name)) set({ seen: [...s.seen, name] });
        return;
      }
      if (step.accept && !step.accept(data)) return;
      const path = s.pathId ? paths.get(s.pathId) : undefined;
      if (path) {
        set({ note: null, seen: [] });
        commit(advance(s, path.steps.length));
        if (get().status === 'done' && path.finale) set({ note: path.finale });
      }
    },
  };
});

function currentStep(s: TourSnapshot): TourStep | null {
  return (s.pathId ? paths.get(s.pathId)?.steps[s.step] : null) ?? null;
}

/** Tells the tour that something happened. Safe from any module at any time: nothing waits, nothing happens. */
export function tourSignal(name: string, data?: unknown): void {
  useTourStore.getState().signal(name, data);
}

/** Whether the running tour waits for this signal right now. */
export function tourExpects(name: string): boolean {
  const s = useTourStore.getState();
  return s.status === 'running' && currentStep(s)?.signal === name;
}

/** Makes the card say something once (e.g. «your first book»), also when the path has ended. */
export function tourNote(note: TourNote): void {
  useTourStore.getState().setNote(note);
}

/** Props for the element the tour may light up: `<button {...tourAnchor('books.add')}>`. */
export function tourAnchor(id: string): { 'data-tour': string } {
  return { 'data-tour': id };
}

export interface TourApi extends TourSnapshot {
  path: TourPath | null;
  /** The step the tour is on, `null` when it is not on a path. */
  current: TourStep | null;
  total: number;
  start: TourStore['start'];
  pause: TourStore['pause'];
  resume: TourStore['resume'];
  skip: TourStore['skip'];
  note: TourNote | null;
  /** Dismisses the note. */
  clearNote(): void;
}

export function useTour(): TourApi {
  const pathId = useTourStore((s) => s.pathId);
  const step = useTourStore((s) => s.step);
  const status = useTourStore((s) => s.status);
  useTourStore((s) => s.registryVersion);
  const start = useTourStore((s) => s.start);
  const pause = useTourStore((s) => s.pause);
  const resume = useTourStore((s) => s.resume);
  const skip = useTourStore((s) => s.skip);
  const note = useTourStore((s) => s.note);
  const setNote = useTourStore((s) => s.setNote);
  const path = (pathId ? paths.get(pathId) : null) ?? null;
  return { note, clearNote: () => setNote(null), pathId, step, status, path, current: path?.steps[step] ?? null, total: path?.steps.length ?? 0, start, pause, resume, skip };
}

/** Ties the store to the active connection; idempotent, so every surface of the tour may call it. */
export function useTourBinding(): void {
  const id = useSession((s) => s.connection?.id ?? null);
  const bind = useTourStore((s) => s.bind);
  // Binding the same id again is a no-op, so every surface may call this.
  useEffect(() => bind(id), [id, bind]);
}

export function resetTourForTest(): void {
  paths.clear();
  useTourStore.setState({ ...INITIAL });
}
