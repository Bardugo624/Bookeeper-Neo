import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Accessible name; required. */
  label: string;
  size?: number;
}

export function Spinner({ label, size = 16 }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={styles.spinner} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className={styles.svg}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42 100" />
      </svg>
    </span>
  );
}
