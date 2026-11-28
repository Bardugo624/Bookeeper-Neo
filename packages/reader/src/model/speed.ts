export interface SpeedState {
  charsPerMinute: number;
  measuredMs: number;
}
export const SPEED_KEY = 'bookeeper.reader.speed';
export const INITIAL_SPEED: SpeedState = { charsPerMinute: 0, measuredMs: 0 };

export const MIN_DWELL_MS = 2000;
export const MAX_DWELL_MS = 180000;
export const MIN_MEASURED_MS = 180000;
export const NEW_PAGE_WEIGHT = 0.2;

/** Only pages kept between 2 seconds and 3 minutes count. Moving average, 0.2 on the new page. */
export function recordTurn(state: SpeedState, chars: number, dwellMs: number): SpeedState {
  if (!(chars > 0) || dwellMs < MIN_DWELL_MS || dwellMs > MAX_DWELL_MS) return state;
  const rate = chars / (dwellMs / 60000);
  const charsPerMinute =
    state.charsPerMinute > 0 ? state.charsPerMinute * (1 - NEW_PAGE_WEIGHT) + rate * NEW_PAGE_WEIGHT : rate;
  return { charsPerMinute, measuredMs: state.measuredMs + dwellMs };
}

/** Minutes to read `chars`, or null until 3 minutes have been measured on this device. */
export function minutesLeft(state: SpeedState, chars: number): number | null {
  if (state.measuredMs < MIN_MEASURED_MS || !(state.charsPerMinute > 0)) return null;
  return Math.max(0, chars) / state.charsPerMinute;
}
