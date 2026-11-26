import { useCanGoBack } from './useCanGoBack';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { positionLabel } from '@bookeeper/ui/shelf';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { Cabinet } from './Cabinet';
import type { FromList } from './searchState';
import { useBook, useShelf, useShelfBooks } from './useBook';
import styles from './WherePage.module.css';
import detail from './BookDetailPage.module.css';

function Missing() {
  const t = useT();
  return <EmptyState icon="book" title={t('msearch.detail.whereIs.missing')} text={t('msearch.detail.whereIs.missingText')} />;
}

function Where({ id }: { id: string }) {
  const t = useT();
  const book = useBook(id);
  const placement = book.data?.placement ?? null;
  const shelfId = placement?.shelf_id ?? '';
  const shelf = useShelf(shelfId, placement !== null);
  const books = useShelfBooks(shelfId, placement !== null);

  if (book.isError) {
    if (book.error instanceof ApiError && book.error.status === 404) {
      return <EmptyState icon="book" title={t('msearch.detail.notFound.title')} text={t('msearch.detail.notFound.text')} />;
    }
    return <ErrorState message={apiErrorMessage(t, book.error)} onRetry={() => void book.refetch()} />;
  }
  if (!book.data) return <Loading />;
  const data = book.data;
  const title = <h2 className={styles.title}>{data.title}</h2>;
  if (!placement) return <div className={styles.page}>{title}<Missing /></div>;

  const failed = shelf.isError ? shelf : books.isError ? books : null;
  if (failed && !(shelf.data && books.data)) {
    return (
      <div className={styles.page}>
        {title}
        <ErrorState message={apiErrorMessage(t, failed.error)} onRetry={() => { void shelf.refetch(); void books.refetch(); }} />
      </div>
    );
  }
  if (!shelf.data || !books.data) return <Loading />;
  // The shelf is the truth: a book moved since the card was loaded is not on it any more.
  const here = books.data.find((b) => b.book_id === data.id);
  if (!here) return <div className={styles.page}>{title}<Missing /></div>;
  const pos = positionLabel({ row: here.row_index, slot: here.slot_index });
  return (
    <div className={styles.page}>
      {title}
      <p role="status" className={styles.phrase}>
        {t('msearch.detail.where.phrase', { shelf: shelf.data.name, row: pos.row, slot: pos.slot })}
      </p>
      <Cabinet shelf={shelf.data} books={books.data} pulledId={data.id} label={t('msearch.detail.whereIs.unit', { title: data.title })} />
    </div>
  );
}

function Loading() {
  const t = useT();
  return (
    <div role="status" aria-label={t('mobile.loading')} className={styles.page}>
      <Skeleton shape="line" width="60%" />
      <Skeleton height={200} />
    </div>
  );
}

/** "Where is it?": the cabinet, read only, with the book pulled out. */
export function WherePage() {
  const t = useT();
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  return (
    <Screen
      title={t('msearch.detail.whereIs.title')}
      leading={
        <Link to={`/books/${encodeURIComponent(id)}`} state={location.state as FromList | null} replace className={detail.back} aria-label={t('msearch.detail.whereIs.back')}
          onClick={(e) => {
            if (!canGoBack) return;
            e.preventDefault();
            navigate(-1);
          }}
        >
          <Icon name="chevron-left" size={22} />
        </Link>
      }
    >
      <Where id={id} />
    </Screen>
  );
}
