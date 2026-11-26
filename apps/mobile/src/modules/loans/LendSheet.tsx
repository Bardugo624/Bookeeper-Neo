import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import { BorrowerChoice } from './BorrowerChoice';
import { useLendForm } from './useLendForm';
import styles from './Loans.module.css';

export interface LendSheetProps {
  book: { id: string; title: string };
  onDone: () => void;
}

/** Lend a book: a person or a name, an optional due date and note; "Lend" sends once. */
export function LendSheet({ book, onDone }: LendSheetProps) {
  const t = useT();
  const form = useLendForm(book.id, onDone);
  const { values, messages } = form;
  return (
    <BottomSheet
      open
      onOpenChange={(open) => (open ? undefined : onDone())}
      title={t('mloans.lend.title')}
      description={t('mloans.lend.book', { title: book.title })}
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.primary} disabled={form.busy} onClick={() => void form.submit()}>
            {t('mloans.lend.save')}
          </button>
          <button type="button" className={styles.button} disabled={form.busy} onClick={onDone}>
            {t('mloans.lend.cancel')}
          </button>
        </div>
      }
    >
      <div className={styles.form}>
        <BorrowerChoice form={form} />
        <label className={styles.field}>
          <span className={styles.label}>
            {t('mloans.lend.due')} <span className={styles.hint}>({t('mloans.lend.dueHint')})</span>
          </span>
          <input type="date" className={styles.input} aria-invalid={messages.due ? true : undefined} value={values.due} onChange={(e) => form.setField('due', e.target.value)} />
          {messages.due ? (
            <span role="alert" className={styles.error}>
              {messages.due}
            </span>
          ) : null}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>
            {t('mloans.lend.notes')} <span className={styles.hint}>({t('mloans.lend.notesHint')})</span>
          </span>
          <textarea className={styles.textarea} rows={2} aria-invalid={messages.notes ? true : undefined} value={values.notes} onChange={(e) => form.setField('notes', e.target.value)} />
          {messages.notes ? (
            <span role="alert" className={styles.error}>
              {messages.notes}
            </span>
          ) : null}
        </label>
        {form.failure ? (
          <p role="alert" className={styles.error}>
            {form.failure}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
