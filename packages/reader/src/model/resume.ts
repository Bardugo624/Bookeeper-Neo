import type { Target } from '../engine/protocol';

/** The last position on this device, from `bookeeper.reader.position.<fileId>`. */
export interface LocalPosition {
  value: string;
  percent: number;
  at: number;
}
export type ResumeSource =
  | {
      kind: 'device';
      deviceId: string;
      /** `desktop`, `mobile`, a reader's name, or null when the device is gone. */
      deviceKind: string | null;
      sameFile: boolean;
      value: string | null;
      percent: number;
      at: number;
    }
  | { kind: 'page'; page: number; percent: number; at: number };

export interface ResumeOffer {
  source: ResumeSource;
  percent: number;
  at: number;
  /** Set for a hand-typed page. */
  page: number | null;
  target: Target;
}

/** One percentage point. */
const MIN_LEAD = 1;

function targetOf(source: ResumeSource): Target {
  if (source.kind === 'device' && source.sameFile && source.value) return { cfi: source.value };
  return { fraction: Math.min(1, Math.max(0, source.percent / 100)) };
}

/** This device's saved copy on the server, preferring the one for this file. */
function ownCopy(
  sources: readonly ResumeSource[],
  deviceId: string,
): Extract<ResumeSource, { kind: 'device' }> | null {
  let found: Extract<ResumeSource, { kind: 'device' }> | null = null;
  for (const s of sources) {
    if (s.kind !== 'device' || s.deviceId !== deviceId) continue;
    if (s.sameFile) return s;
    found ??= s;
  }
  return found;
}

/** Another source is further ahead (by 1 point or more) and newer than the local position. Never jumps by itself. */
export function decideResume(
  local: LocalPosition | null,
  sources: readonly ResumeSource[],
  deviceId: string,
): ResumeOffer | null {
  // Without a local position the book opens at this device's own server copy, so that is the baseline.
  const own = ownCopy(sources, deviceId);
  const percent = local?.percent ?? own?.percent ?? 0;
  const at = local?.at ?? own?.at ?? -Infinity;
  let best: ResumeSource | null = null;
  for (const s of sources) {
    if (s.kind === 'device' && s.deviceId === deviceId) continue;
    if (s.percent - percent < MIN_LEAD - 1e-9 || s.at <= at) continue;
    if (!best || s.percent > best.percent || (s.percent === best.percent && s.at > best.at)) best = s;
  }
  if (!best) return null;
  return {
    source: best,
    percent: best.percent,
    at: best.at,
    page: best.kind === 'page' ? best.page : null,
    target: targetOf(best),
  };
}

/** Where the book opens: the device's own saved copy on the server, when there is no local position. */
export function openingTarget(
  local: LocalPosition | null,
  sources: readonly ResumeSource[],
  deviceId: string,
): Target | null {
  if (local) return null;
  const own = ownCopy(sources, deviceId);
  if (!own) return null;
  // A copy of another file of the book has no usable CFI here: only its percentage carries over.
  return own.sameFile && own.value
    ? { cfi: own.value }
    : { fraction: Math.min(1, Math.max(0, own.percent / 100)) };
}
