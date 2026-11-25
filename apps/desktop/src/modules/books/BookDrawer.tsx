import { useId, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { Drawer, useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { TagPicker } from '../tags';
import { BookFormFields } from './BookFormFields';
import { CoverPicker } from './CoverPicker';
import { IsbnStep } from './IsbnStep';
import { ExistingNotice, LookupNotice } from './LookupNotice';
import { authorsOf } from './format';
import type { SaveResult } from './useBookWrites';
import { useBookEditor } from './useBookEditor';
import { mayHaveCover, useCoverState } from './useCover';
import styles from './BookForm.module.css';

export interface BookDrawerProps {
  open: boolean;
  /** The book being edited; absent for "New book". */
  book?: BookOut;
  onClose(): void;
  /** Runs after a successful save of an existing book. */
  onSaved?(book: BookOut): void;
  /** Runs after a successful creation; `another` is true for "Save and add another". */
  onCreated?(book: BookOut, another: boolean): void;
}

/** "New book" (ISBN step, then form) or "Edit book" (form). Mounted only while open. */
export function BookDrawer(props: BookDrawerProps) {
  const [round, setRound] = useState(0);
  if (!props.open) return null;
  // A new `key` empties the panel for "Save and add another".
  return <BookEditor key={round} {...props} onAnother={() => setRound((n) => n + 1)} />;
}

function BookEditor({ book, onClose, onSaved, onCreated, onAnother }: BookDrawerProps & { onAnother(): void }) {
  const t = useT();
  const toast = useToast();
  const formId = useId();
  const [step, setStep] = useState<'isbn' | 'form'>(book ? 'form' : 'isbn');
  const { src: stored, status: storedStatus } = useCoverState(book?.id ?? '', mayHaveCover(book?.cover_color));

  const done = (result: SaveResult | null, another: boolean) => {
    if (result) {
      toast.show({
        title: t(book ? 'books.toast.updated' : 'books.toast.created', { title: result.book.title }),
        description: result.colorFailed
          ? t('books.toast.colorFailed')
          : result.coverFailed
            ? t('books.toast.coverFailed')
            : result.tagsFailed
              ? t('books.toast.tagsFailed')
              : undefined,
        tone: result.coverFailed || result.colorFailed || result.tagsFailed ? 'warn' : 'ok',
      });
      if (book) onSaved?.(result.book);
      else onCreated?.(result.book, another);
    }
    if (another) onAnother();
    else onClose();
  };
  const editor = useBookEditor(book, done, Boolean(stored) || storedStatus === 'failed');
  const { form } = editor;
  const title = book ? t('books.edit.title') : t('books.new.title');

  return (
    <Drawer
      open
      onOpenChange={(next) => {
        if (!next && !editor.saving) onClose();
      }}
      title={title}
      closeLabel={t('common.close')}
      footer={
        step === 'form' ? (
          <div className={styles.actions}>
            <Button variant="ghost" disabled={editor.saving} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {book ? null : (
              <Button variant="secondary" disabled={editor.saving} onClick={() => void editor.save(true)()}>
                {t('books.new.saveAnother')}
              </Button>
            )}
            <Button type="submit" form={formId} variant="primary" loading={editor.saving} loadingLabel={t('common.saving')}>
              {t('common.save')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {step === 'isbn' ? (
        <IsbnStep
          onDone={(result) => {
            editor.start(result);
            setStep('form');
          }}
        />
      ) : (
        <form id={formId} className={styles.form} onSubmit={editor.save(false)} noValidate>
          {form.submitError ? (
            <p role="alert" className={styles.error}>
              {apiErrorMessage(t, form.submitError)}
            </p>
          ) : null}
          <LookupNotice outcome={editor.outcome} />
          <ExistingNotice existing={editor.duplicate} />
          <BookFormFields form={form} />
          <TagPicker value={editor.tagIds} onChange={editor.setTagIds} disabled={editor.saving} />
          <CoverPicker
            title={form.values.title}
            author={authorsOf(form.values) || undefined}
            storedSrc={stored}
            storedStatus={storedStatus}
            candidates={editor.candidates}
            plan={editor.plan}
            onPlan={editor.setPlan}
            color={editor.color}
            onColor={editor.setColor}
          />
        </form>
      )}
    </Drawer>
  );
}
