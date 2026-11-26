import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { ApiError } from '@bookeeper/api';
import { EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, BottomSheet, apiErrorMessage } from '../../kit';
import { useSession } from '../../session';
import { canEditBooks } from './editModel';
import { EditFields } from './EditFields';
import { usePeople } from './useBookEdit';
import { useBook } from './useBook';
import { useEditForm } from './useEditForm';
import styles from './Edit.module.css';

const FORM_ID = 'book-edit-form';

function EditForm({ book }: { book: BookOut }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const meId = useSession((s) => s.me?.user.id);
  const people = usePeople();
  const back = { pathname: `/books/${encodeURIComponent(book.id)}` };
  // Saving pops the edit entry, so "back" from the card goes where the card was opened from.
  const form = useEditForm(book, () => (location.key === 'default' ? navigate(back, { replace: true, state: location.state }) : navigate(-1)));
  const { blocker } = form;
  return (
    <Screen
      title={t('msearch.edit.title')}
      leading={
        <button type="button" className={styles.back} aria-label={t('msearch.edit.back')} onClick={() => (location.key === 'default' ? navigate(back, { replace: true, state: location.state }) : navigate(-1))}>
          <Icon name="chevron-left" size={22} />
        </button>
      }
      footer={
        <button type="submit" form={FORM_ID} className={styles.save} disabled={form.saving}>
          {form.saving ? t('msearch.edit.saving') : t('msearch.edit.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} noValidate onSubmit={(e) => void form.submit(e)}>
        {form.failure ? (
          <p role="alert" className={styles.error}>
            {form.failure}
          </p>
        ) : null}
        {people.isError ? <p className={styles.hint}>{t('msearch.edit.peopleError')}</p> : null}
        <EditFields values={form.values} errors={form.errors} people={people.data ?? []} currentOwner={book.owner ?? undefined} meId={meId} set={form.set} />
      </form>
      <BottomSheet
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => (open || blocker.state !== 'blocked' ? undefined : blocker.reset())}
        title={t('msearch.edit.leave.title')}
        description={t('msearch.edit.leave.text')}
        footer={
          <div className={styles.leave}>
            <button type="button" className={styles.save} onClick={() => (blocker.state === 'blocked' ? blocker.reset() : undefined)}>
              {t('msearch.edit.leave.stay')}
            </button>
            <button type="button" className={styles.discard} onClick={() => (blocker.state === 'blocked' ? blocker.proceed() : undefined)}>
              {t('msearch.edit.leave.discard')}
            </button>
          </div>
        }
      />
    </Screen>
  );
}

/** `/books/:id/edit`: the book's data as a form, for those who may write books. */
export function BookEditPage() {
  const t = useT();
  const { id = '' } = useParams();
  const book = useBook(id);
  const canEdit = useSession((s) => canEditBooks(s.me?.user.role));
  if (!canEdit) return <Navigate to={`/books/${encodeURIComponent(id)}`} replace />;
  if (book.data) return <EditForm key={book.data.id} book={book.data} />;
  let body;
  if (book.isError && book.error instanceof ApiError && book.error.status === 404) {
    body = <EmptyState icon="book" title={t('msearch.detail.notFound.title')} text={t('msearch.detail.notFound.text')} />;
  } else if (book.isError) body = <ErrorState message={apiErrorMessage(t, book.error)} onRetry={() => void book.refetch()} />;
  else body = <Skeleton height={240} />;
  return <Screen title={t('msearch.edit.title')}>{body}</Screen>;
}
