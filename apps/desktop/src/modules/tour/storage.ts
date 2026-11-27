import { EMPTY_SNAPSHOT, isStatus, type TourSnapshot } from './model';

const KEY = 'bookeeper.tour.';
const PENDING = 'bookeeper.tour.pending.';

/** Every access is guarded: without storage the tour simply does not remember. */
export function loadTour(connectionId: string): TourSnapshot {
  try {
    const raw = localStorage.getItem(KEY + connectionId);
    if (!raw) return EMPTY_SNAPSHOT;
    const v = JSON.parse(raw) as Partial<TourSnapshot> | null;
    if (!v || !isStatus(v.status)) return EMPTY_SNAPSHOT;
    const step = typeof v.step === 'number' && Number.isInteger(v.step) && v.step >= 0 ? v.step : 0;
    return { pathId: typeof v.pathId === 'string' ? v.pathId : null, step, status: v.status };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function saveTour(connectionId: string, snapshot: TourSnapshot): void {
  try {
    localStorage.setItem(KEY + connectionId, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable: the tour carries on for this run only.
  }
}

/** The flag «this person is new», written by the first-access flows and read by the tour's start. */
export function setTourPending(connectionId: string): void {
  try {
    localStorage.setItem(PENDING + connectionId, '1');
  } catch {
    // Without storage the tour does not start: it never shows to someone who might have seen it.
  }
}

export function isTourPending(connectionId: string): boolean {
  try {
    return localStorage.getItem(PENDING + connectionId) !== null;
  } catch {
    return false;
  }
}

export function clearTourPending(connectionId: string): void {
  try {
    localStorage.removeItem(PENDING + connectionId);
  } catch {
    // Nothing to clear without storage.
  }
}
