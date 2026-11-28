import type { PositionOut, ReadingOut } from '@bookeeper/api';
import type { ResumeSource } from '../model/resume';

/** The sources `decideResume` compares: other devices' positions and a hand-typed page. */
export function sourcesFrom(
  positions: readonly PositionOut[],
  reading: ReadingOut | null,
  fileId: string,
  _deviceId: string,
): ResumeSource[] {
  const out: ResumeSource[] = [];
  for (const p of positions) {
    if (p.percent == null) continue;
    const own = p.kind === 'cfi';
    out.push({
      kind: 'device',
      deviceId: p.device_id ?? '',
      // KOReader and Kobo positions are named after the reader and carry over by percentage only.
      deviceKind: own ? (p.device_kind ?? null) : p.kind,
      sameFile: p.file_id === fileId,
      value: own ? p.value : null,
      percent: p.percent,
      at: p.updated_at,
    });
  }
  // The person's one progress also moves when a reader saves, so it is a typed page
  // only when it holds a page and no position was saved at that moment.
  if (
    reading &&
    reading.current_page != null &&
    reading.progress_percent != null &&
    reading.progress_at != null &&
    !positions.some((p) => p.updated_at === reading.progress_at)
  ) {
    out.push({ kind: 'page', page: reading.current_page, percent: reading.progress_percent, at: reading.progress_at });
  }
  return out;
}
