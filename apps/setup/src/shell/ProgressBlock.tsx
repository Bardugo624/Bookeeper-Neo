import { useEffect, useRef } from 'react';
import { FillBar } from '@bookeeper/ui/book';
import type { ProgressEvent, StepId } from '../bridge';
import { useT } from './i18n';
import styles from './ProgressBlock.module.css';

export interface ProgressBlockProps {
  /** Key of the title, e.g. `setup.progress.install`. */
  titleKey: string;
  event: ProgressEvent | null;
  /** The step named until the first event arrives: `removeApp` for an uninstall. */
  initialStep?: StepId;
}

/** Title, percentage, bar and the step in a polite live region: it speaks when the step changes, not on every tick. */
export function ProgressBlock({ titleKey, event, initialStep = 'prepare' }: ProgressBlockProps) {
  const t = useT();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus({ preventScroll: true }), []);

  const fraction = event?.fraction ?? 0;
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const step = t(`setup.progress.step.${event?.step ?? initialStep}`);
  const heading = t(titleKey);

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <h1 ref={title} tabIndex={-1} className={styles.title}>
          {heading}
        </h1>
        <span className={styles.percent} aria-hidden="true">
          {percent}%
        </span>
      </div>
      <FillBar value={fraction} tone="ok" label={heading} valueText={t('setup.progress.valueText', { step, percent })} />
      <p className={styles.step} role="status">
        {step}
      </p>
    </div>
  );
}
