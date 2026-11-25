import { useRef, useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { BookCover, CLOTH_TONES } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { COVER_MAX_BYTES, COVER_TYPES, coverFileProblem, type CoverFileProblem } from './coverFile';
import type { CoverPlan } from './useBookWrites';
import { useFilePreview } from './useFilePreview';
import styles from './BookForm.module.css';

export interface CoverPickerProps {
  title: string;
  author?: string;
  /** Object URL of the cover already stored (editing). */
  storedSrc?: string;
  /** Cover URLs the lookup offered, most authoritative first. */
  candidates: string[];
  plan: CoverPlan;
  onPlan(plan: CoverPlan): void;
  /** Placeholder color chosen (or stored) for the book; null is "Automatic". */
  color: string | null;
  onColor(color: string | null): void;
}

/** Names of the `CLOTH_TONES`, in the same order. */
const TONE_NAMES = ['sage', 'terracotta', 'night', 'plum', 'amber', 'graphite', 'moss', 'wine', 'teal', 'umber'] as const;

/** "Automatic" and the cloth tones as one single-choice group; the arrows move the choice. */
function ColorSwatches({ value, onChange }: { value: string | null; onChange(color: string | null): void }) {
  const t = useT();
  const choices: Array<{ color: string | null; name: string }> = [
    { color: null, name: t('books.cover.color.auto') },
    ...CLOTH_TONES.map((color, i) => ({ color, name: t(`books.cover.color.tones.${TONE_NAMES[i]}`) })),
  ];
  const checked = choices.findIndex((c) => c.color === value);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, step: number) => {
    const to = (from + step + choices.length) % choices.length;
    onChange(choices[to]!.color);
    refs.current[to]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t('books.cover.color.label')} className={styles.swatches}>
      {choices.map((c, i) => (
        <button
          key={c.color ?? 'auto'}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === checked}
          aria-label={c.name}
          title={c.name}
          tabIndex={i === Math.max(checked, 0) ? 0 : -1}
          className={c.color === null ? `${styles.swatch} ${styles.swatchAuto}` : styles.swatch}
          style={c.color === null ? undefined : { background: c.color }}
          onClick={() => onChange(c.color)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(i, -1);
            }
          }}
        >
          {c.color === null ? 'A' : null}
        </button>
      ))}
    </div>
  );
}

/** Preview and choice of the cover: the lookup's, a file, none. */
export function CoverPicker({ title, author, storedSrc, candidates, plan, onPlan, color, onColor }: CoverPickerProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<CoverFileProblem | null>(null);
  const filePreview = useFilePreview(plan.kind === 'file' ? plan.file : undefined);
  const offered = candidates[0];
  let shown: string | undefined;
  if (plan.kind === 'file') shown = filePreview;
  else if (plan.kind === 'lookup') shown = offered;
  else if (plan.kind === 'keep') shown = storedSrc;
  const canUseOffered = offered !== undefined && plan.kind !== 'lookup';

  const choose = (file: File | undefined) => {
    if (!file) return;
    const found = coverFileProblem(file);
    setProblem(found);
    if (!found) onPlan({ kind: 'file', file });
  };

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{t('books.cover.title')}</legend>
      <div className={styles.cover}>
        <BookCover title={title || t('books.cover.untitled')} author={author} src={shown} color={color ?? undefined} width={96} />
        <div className={styles.coverActions}>
          {canUseOffered ? (
            <div className={styles.offer}>
              <BookCover title={title || t('books.cover.untitled')} src={offered} width={40} />
              <Button variant="secondary" size="sm" onClick={() => onPlan({ kind: 'lookup', urls: candidates })}>
                {t('books.cover.useThis')}
              </Button>
            </div>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
            {t('books.cover.upload')}
          </Button>
          {shown ? (
            <Button variant="ghost" size="sm" onClick={() => onPlan({ kind: 'remove' })}>
              {t('books.cover.remove')}
            </Button>
          ) : null}
          {shown ? null : <ColorSwatches value={color} onChange={onColor} />}
          <input
            ref={input}
            type="file"
            accept={COVER_TYPES.join(',')}
            aria-label={t('books.cover.file')}
            className={styles.hidden}
            tabIndex={-1}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {problem ? (
            <p role="alert" className={styles.error}>
              {problem === 'type'
                ? t('books.cover.badType')
                : t('books.cover.tooBig', { mb: COVER_MAX_BYTES / (1024 * 1024) })}
            </p>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
