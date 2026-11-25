import { useRef, useState } from 'react';
import { Button, Skeleton } from '@bookeeper/ui/base';
import { BookCover, CLOTH_TONES } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { FilePicker } from '../../kit';
import { COVER_MAX_BYTES, COVER_TYPES, coverFileProblem, type CoverFileProblem } from './coverFile';
import type { CoverPlan } from './useBookWrites';
import type { CoverStatus } from './useCover';
import { useFilePreview } from './useFilePreview';
import styles from './BookForm.module.css';

export interface CoverPickerProps {
  title: string;
  author?: string;
  /** Object URL of the cover already stored (editing). */
  storedSrc?: string;
  /** How the request for the stored cover stands; absent for a new book. */
  storedStatus?: CoverStatus;
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
export function CoverPicker({ title, author, storedSrc, storedStatus = 'none', candidates, plan, onPlan, color, onColor }: CoverPickerProps) {
  const t = useT();
  const [problem, setProblem] = useState<CoverFileProblem | null>(null);
  const filePreview = useFilePreview(plan.kind === 'file' ? plan.file : undefined);
  const offered = candidates[0];
  let shown: string | undefined;
  if (plan.kind === 'file') shown = filePreview;
  else if (plan.kind === 'lookup') shown = offered;
  else if (plan.kind === 'keep') shown = storedSrc;
  // Swatches only once it is certain there is no cover: the request ended "absent" or failed, or the
  // cover was removed in the form. While it loads, a skeleton stands in.
  const storedPending = plan.kind === 'keep' && !storedSrc && storedStatus === 'loading';
  const storedFailed = plan.kind === 'keep' && !storedSrc && storedStatus === 'failed';
  const canUseOffered = offered !== undefined && plan.kind !== 'lookup';

  const choose = (file: File | null) => {
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
          <FilePicker
            size="sm"
            label={t('books.cover.upload')}
            inputLabel={t('books.cover.file')}
            accept={COVER_TYPES.join(',')}
            fileName={plan.kind === 'file' ? plan.file.name : undefined}
            onPick={choose}
          />
          {shown || storedFailed ? (
            <Button variant="ghost" size="sm" onClick={() => onPlan({ kind: 'remove' })}>
              {t('books.cover.remove')}
            </Button>
          ) : null}
          {storedFailed ? (
            <p role="alert" className={styles.error}>
              {t('common.errors.network')}
            </p>
          ) : null}
          {shown ? null : storedPending ? (
            <Skeleton width={160} height={26} />
          ) : (
            <ColorSwatches value={color} onChange={onColor} />
          )}
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
