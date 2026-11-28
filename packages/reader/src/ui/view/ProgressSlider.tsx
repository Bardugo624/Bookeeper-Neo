import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReaderT } from '../../i18n';
import { percentOf } from './format';
import styles from './ProgressSlider.module.css';

export interface ProgressSliderProps {
  /** 0 to 1. */
  fraction: number;
  /** Where the chapters start, 0 to 1. */
  ticks: readonly number[];
  /** The chapter that holds a point of the book. */
  chapterAt: (fraction: number) => string | null;
  /** Called on release (or when the key comes up) with the chosen point. */
  onSeek: (fraction: number) => void;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const STEP = 0.01;
const BIG_STEP = 0.1;
/** How long the chosen point stays while the page catches up. */
const HOLD_MS = 1500;

export function ProgressSlider({ fraction, ticks, chapterAt, onSeek }: ProgressSliderProps) {
  const t = useReaderT();
  const track = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const dragging = useRef(false);
  const latest = useRef(0);

  useEffect(() => setHeld(null), [fraction]);
  useEffect(() => {
    if (held === null) return;
    const id = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(id);
  }, [held]);

  const shown = clamp(draft ?? held ?? fraction);
  const percent = percentOf(shown);
  const chapter = chapterAt(shown);
  const scrubbing = draft !== null;

  const at = (e: PointerEvent): number => {
    const r = track.current!.getBoundingClientRect();
    return r.width > 0 ? clamp((e.clientX - r.left) / r.width) : 0;
  };
  const commit = (value: number) => {
    setDraft(null);
    setHeld(value);
    onSeek(value);
  };
  const move = (value: number) => {
    latest.current = value;
    setDraft(value);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer that is already gone */
    }
    move(at(e));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging.current) move(at(e));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    commit(at(e));
  };
  const onPointerCancel = () => {
    dragging.current = false;
    setDraft(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const base = draft ?? fraction;
    const next: Record<string, number> = {
      ArrowRight: base + STEP,
      ArrowUp: base + STEP,
      ArrowLeft: base - STEP,
      ArrowDown: base - STEP,
      PageUp: base + BIG_STEP,
      PageDown: base - BIG_STEP,
      Home: 0,
      End: 1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    e.stopPropagation();
    move(clamp(next[e.key]!));
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (draft === null || !['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) return;
    commit(latest.current);
  };

  const hintAt = Math.min(0.92, Math.max(0.08, shown));
  return (
    <div
      className={styles.slider}
      role="slider"
      tabIndex={0}
      aria-label={t('reader.slider.label')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={chapter ? t('reader.slider.value', { percent, chapter }) : t('reader.slider.value_plain', { percent })}
      data-scrubbing={scrubbing || undefined}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => draft !== null && !dragging.current && commit(latest.current)}
    >
      <div
        ref={track}
        data-track
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className={styles.rail}>
          <div className={styles.fill} style={{ width: `${shown * 100}%` }} />
          {ticks.map((f) => (
            <span key={f} className={styles.tick} data-passed={f <= shown || undefined} style={{ left: `${f * 100}%` }} />
          ))}
        </div>
        <span className={styles.thumb} style={{ left: `${shown * 100}%` }} />
        {scrubbing ? (
          <span className={styles.hint} style={{ left: `${hintAt * 100}%` }} aria-hidden="true">
            {chapter ? t('reader.slider.hint', { chapter, percent }) : t('reader.slider.hint_plain', { percent })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
