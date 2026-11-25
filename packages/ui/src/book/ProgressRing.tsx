import type { CSSProperties, ReactNode } from 'react';
import { clamp01 } from './clamp';
import styles from './ProgressRing.module.css';

export interface ProgressRingProps {
  value: number;
  size?: number;
  label: string;
  children?: ReactNode;
}

const STROKE = 6;

export function ProgressRing({ value, size = 60, label, children }: ProgressRingProps) {
  const v = clamp01(value);
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const style = { width: size, height: size, '--ring-c': c } as CSSProperties;
  return (
    <div
      className={styles.ring}
      style={style}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={styles.svg}>
        <circle className={styles.track} cx={size / 2} cy={size / 2} r={r} strokeWidth={STROKE} fill="none" />
        <circle
          className={styles.arc}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      {children ? <div className={styles.center}>{children}</div> : null}
    </div>
  );
}
