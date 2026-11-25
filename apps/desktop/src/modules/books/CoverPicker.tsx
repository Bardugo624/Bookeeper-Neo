import { useRef, useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
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
}

/** Preview and choice of the cover: the lookup's, a file, none. */
export function CoverPicker({ title, author, storedSrc, candidates, plan, onPlan }: CoverPickerProps) {
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
        <BookCover title={title || t('books.cover.untitled')} author={author} src={shown} width={96} />
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
