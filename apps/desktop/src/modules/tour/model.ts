/** The tour, as data: a path is at most three steps, each completed by a real action (a signal). */

export const MAX_STEPS = 3;

export type TourStatus = 'idle' | 'running' | 'paused' | 'done' | 'skipped';

/** What a step's target function can ask about the page. */
export interface TourContext {
  /** Whether an anchor with this id is on the page right now. */
  has(anchorId: string): boolean;
  /** Whether a signal other than the step's own came in while the step has been on (a moment of the step). */
  saw(signal: string): boolean;
}

export interface TourStep {
  id: string;
  /** i18n keys, with the parameters they need. */
  titleKey: string;
  textKey: string;
  params?: Record<string, string | number>;
  /** The anchor to light up, or a function that picks it (a step may guide through several places). */
  target: string | ((ctx: TourContext) => string | null);
  /** What the card says when the step points at one of these anchors instead (a step may guide through several places). */
  variants?: Readonly<Record<string, Pick<TourStep, 'titleKey' | 'textKey' | 'params'>>>;
  /** The name of the signal that completes the step. */
  signal: string;
  /** Narrows the signal by its data; every signal with the right name counts when absent. */
  accept?: (data: unknown) => boolean;
}

export interface TourPath {
  id: string;
  /** May change over time (e.g. a step that needs a phone to pair); read it each time, never keep it. */
  steps: readonly TourStep[];
  /** Said by the card for a few seconds when the last step is done. */
  finale?: TourNote;
}

/** What is remembered per connection. */
export interface TourSnapshot {
  pathId: string | null;
  step: number;
  status: TourStatus;
}

export const EMPTY_SNAPSHOT: TourSnapshot = { pathId: null, step: 0, status: 'idle' };

const STATUSES: readonly TourStatus[] = ['idle', 'running', 'paused', 'done', 'skipped'];

export function isStatus(v: unknown): v is TourStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

/** The state after the current step's signal: the next step, or `done` after the last one. */
export function advance(s: TourSnapshot, total: number): TourSnapshot {
  if (s.status !== 'running') return s;
  return s.step + 1 >= total ? { ...s, step: total - 1, status: 'done' } : { ...s, step: s.step + 1 };
}

/** The anchor id a step points at right now, if any. */
export function resolveTarget(step: TourStep, ctx: TourContext): string | null {
  return typeof step.target === 'string' ? step.target : step.target(ctx);
}

/** The step as the card should tell it, given the anchor it points at now. */
export function tellStep(step: TourStep, anchorId: string | null): TourStep {
  const variant = anchorId ? step.variants?.[anchorId] : undefined;
  return variant ? { ...step, ...variant } : step;
}

/** A line the card says once, on top of the step (or alone, when the path is over). */
export interface TourNote {
  titleKey: string;
  textKey: string;
  params?: Record<string, string | number>;
}
