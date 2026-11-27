import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Button } from '@bookeeper/ui/base';
import type { SetupInfo } from '../bridge';
import { formatBytes, useLocale, useT } from '../shell';
import styles from './ChoicePanel.module.css';

export const OPTIONS = ['keep', 'delete'] as const;
export type Choice = (typeof OPTIONS)[number];

/** `Text` variant of a key: e-books named when there are any, data only when there is no library. */
export function variantSuffix(data: SetupInfo['data']): '' | 'Ebooks' | 'Remote' {
  if (!data.hasLibrary) return 'Remote';
  return data.hasEbooks ? 'Ebooks' : '';
}

export interface ChoicePanelProps {
  info: SetupInfo;
  choice: Choice;
  onChoice(choice: Choice): void;
  onCancel(): void;
  onGo(): void;
}

/** Two cards in a radio group: keep the library (already chosen) or delete everything. */
export function ChoicePanel({ info, choice, onChoice, onCancel, onGo }: ChoicePanelProps) {
  const t = useT();
  const locale = useLocale();
  const title = useRef<HTMLHeadingElement>(null);
  const radios = useRef<Record<Choice, HTMLButtonElement | null>>({ keep: null, delete: null });
  useEffect(() => title.current?.focus({ preventScroll: true }), []);

  const suffix = variantSuffix(info.data);
  const size = formatBytes(info.data.bytes, locale);
  const textKey = (option: Choice) => `setup.uninstall.${option}.text${suffix}`;

  const move = (event: KeyboardEvent, from: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = OPTIONS[(from + step + OPTIONS.length) % OPTIONS.length]!;
    onChoice(next);
    radios.current[next]?.focus();
  };

  return (
    <div className={styles.panel}>
      <div>
        <h1 ref={title} tabIndex={-1} id="uninstall-title" className={styles.title}>
          {t('setup.uninstall.title')}
        </h1>
        <p className={styles.meta}>
          {t('setup.uninstall.meta', { version: info.installed?.version ?? '', dir: info.installed?.dir ?? '' })}
        </p>
      </div>
      <div className={styles.choice} role="radiogroup" aria-labelledby="uninstall-title">
        {OPTIONS.map((option, index) => {
          const on = choice === option;
          return (
            <button
              key={option}
              ref={(el) => {
                radios.current[option] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={styles.card}
              data-on={on || undefined}
              onClick={() => onChoice(option)}
              onKeyDown={(event) => move(event, index)}
            >
              <span className={styles.radio} aria-hidden="true" />
              <span>
                <b className={styles.cardTitle}>{t(`setup.uninstall.${option}.title`)}</b>
                <span className={styles.cardText}>{t(textKey(option), { size })}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          {t('setup.uninstall.cancel')}
        </Button>
        <Button variant="primary" onClick={onGo}>
          {t('setup.uninstall.go')}
        </Button>
      </div>
    </div>
  );
}
