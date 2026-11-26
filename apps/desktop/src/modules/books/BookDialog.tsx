import { useId, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { Dialog, useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { BookSheet } from './BookSheet';
import { IsbnStep } from './IsbnStep';
import type { SaveResult } from './useBookWrites';
import { useBookEditor } from './useBookEditor';
import { mayHaveCover, useCoverState } from './useCover';

export interface BookDialogProps {
  open: boolean;
  /** The book being edited; absent for "New book". */
  book?: BookOut;
  /** The button that opened the dialog: it grows from there and gets the focus back. Absent from the palette. */
  origin?: HTMLElement | null;
  onClose(): void;
  /** Runs after a successful save of an existing book. */
  onSaved?(book: BookOut): void;
  /** Runs after a successful creation; `another` is true for "Save and add another". */
  onCreated?(book: BookOut, another: boolean): void;
}

/** "New book" (ISBN step, then the book sheet) or "Edit book" (form). Mounted only while open. */
export function BookDialog(props: BookDialogProps) {
  const [round, setRound] = useState(0);
  if (!props.open) return null;
  // A new `key` empties the dialog for "Save and add another".
  return <BookEditor key={round} {...props} onAnother={() => setRound((n) => n + 1)} />;
}

function BookEditor({ book, origin, onClose, onSaved, onCreated, onAnother }: BookDialogProps & { onAnother(): void }) {
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
  const title = book ? t('books.edit.title') : t('books.new.title');

  const sheet = step === 'form';

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !editor.saving) onClose();
      }}
      title={title}
      closeLabel={t('common.close')}
      size={sheet ? 'wide' : 'default'}
      origin={origin}
      footer={
        sheet ? (
          <>
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
          </>
        ) : undefined
      }
    >
      {sheet ? (
        <BookSheet id={formId} editor={editor} storedSrc={stored} storedStatus={storedStatus} editing={Boolean(book)} />
      ) : (
        <IsbnStep
          onDone={(result) => {
            editor.start(result);
            setStep('form');
          }}
        />
      )}
    </Dialog>
  );
}
