/** The same code read twice in a row within this time is one reading. */
export const REPEAT_MS = 3000;

export type StepKind = 'placed' | 'moved' | 'added' | 'skipped';

/** A position, 0-based as the API counts it. */
export interface Place {
  shelfId: string;
  row: number;
  slot: number;
}

export interface Step {
  kind: StepKind;
  isbn: string;
  title: string;
  bookId?: string;
  /** Where it landed (`placed`, `moved`, `added`). */
  slot?: number;
  /** Where it was before (`moved`); `null` when it had no place. */
  from?: Place | null;
}

export type FeedbackKind = StepKind | 'here' | 'undone' | 'error' | 'undoError';

export interface Feedback {
  kind: FeedbackKind;
  title: string;
  slot?: number;
  from?: Place | null;
}

export type Outcome =
  | { kind: 'step'; step: Step }
  | { kind: 'here'; title: string; slot: number }
  | { kind: 'need-title' }
  | { kind: 'full' };

export interface SessionState {
  steps: Step[];
  /** A code is being resolved, or an undo is running: nothing else is taken. */
  busy: boolean;
  last: { code: string; at: number } | null;
  feedback: Feedback | null;
  /** The one step that "undo" can take back; at most once. */
  undo: Step | null;
  /** The ISBN waiting for a title (the sheet is open). */
  awaiting: string | null;
  /** The ISBN whose step failed on the network, for "retry". */
  failed: string | null;
  status: 'running' | 'full' | 'finished';
}

export type Action =
  | { type: 'read'; code: string; at: number }
  | { type: 'retry' }
  | { type: 'titled' }
  | { type: 'outcome'; isbn: string; outcome: Outcome }
  | { type: 'skip'; isbn: string }
  | { type: 'fail'; isbn: string }
  | { type: 'undo-start' }
  | { type: 'undo-done' }
  | { type: 'undo-fail' }
  | { type: 'finish' };

export const initialState: SessionState = {
  steps: [],
  busy: false,
  last: null,
  feedback: null,
  undo: null,
  awaiting: null,
  failed: null,
  status: 'running',
};

/** Whether a reading is taken: not while busy or over, and not the same code again within three seconds. */
export function accepts(state: SessionState, code: string, at: number): boolean {
  if (state.status !== 'running' || state.busy) return false;
  return !(state.last && state.last.code === code && at - state.last.at < REPEAT_MS);
}

/** Books put on the shelf: placed, moved and added; a skipped code is not one. */
export const countPlaced = (steps: Step[]): number => steps.filter((s) => s.kind !== 'skipped').length;

export const countKind = (steps: Step[], kind: StepKind): number => steps.filter((s) => s.kind === kind).length;

function record(state: SessionState, step: Step): SessionState {
  const feedback: Feedback = { kind: step.kind, title: step.title, slot: step.slot, from: step.from };
  return {
    ...state,
    steps: [...state.steps, step],
    busy: false,
    awaiting: null,
    failed: null,
    feedback,
    undo: step.kind === 'skipped' ? state.undo : step,
  };
}

export function reduce(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'read':
      if (!accepts(state, action.code, action.at)) return state;
      return { ...state, busy: true, last: { code: action.code, at: action.at }, failed: null, feedback: null };
    case 'retry':
      return state.failed && !state.busy ? { ...state, busy: true, failed: null, feedback: null } : state;
    case 'titled':
      return state.awaiting ? { ...state, awaiting: null } : state;
    case 'outcome': {
      const { outcome } = action;
      if (outcome.kind === 'step') return record(state, outcome.step);
      if (outcome.kind === 'here') {
        return { ...state, busy: false, feedback: { kind: 'here', title: outcome.title, slot: outcome.slot } };
      }
      if (outcome.kind === 'full') return { ...state, busy: false, status: 'full', feedback: null };
      return { ...state, awaiting: action.isbn };
    }
    case 'skip':
      return record(state, { kind: 'skipped', isbn: action.isbn, title: action.isbn });
    case 'fail':
      return { ...state, busy: false, awaiting: null, failed: action.isbn, feedback: { kind: 'error', title: action.isbn } };
    case 'undo-start':
      return state.undo && !state.busy ? { ...state, busy: true } : state;
    case 'undo-done': {
      const target = state.undo;
      if (!target) return state;
      return {
        ...state,
        steps: state.steps.filter((s) => s !== target),
        busy: false,
        undo: null,
        // The same book may be read again at once.
        last: null,
        feedback: { kind: 'undone', title: target.title },
      };
    }
    case 'undo-fail':
      return { ...state, busy: false, feedback: { kind: 'undoError', title: state.undo?.title ?? '' } };
    case 'finish':
      return state.status === 'running' ? { ...state, status: 'finished', busy: false } : state;
  }
}
