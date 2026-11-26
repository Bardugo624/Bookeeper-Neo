import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { Cabinet, useCanGoBack, useShelf, useShelfBooks } from '../search';
import { ShelfBookList } from './ShelfBookList';
import styles from './Shelves.module.css';

function Body({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const shelf = useShelf(id, true);
  const books = useShelfBooks(id, true);
  const failed = shelf.isError ? shelf : books.isError ? books : null;
  if (failed && !(shelf.data && books.data)) {
    if (failed.error instanceof ApiError && failed.error.status === 404) {
      return <EmptyState icon="library" title={t('mshelves.notFound.title')} text={t('mshelves.notFound.text')} />;
    }
    return <ErrorState message={`${t('mshelves.loadErrorUnit')} ${apiErrorMessage(t, failed.error)}`} onRetry={() => { void shelf.refetch(); void books.refetch(); }} />;
  }
  if (!shelf.data || !books.data) {
    return (
      <div role="status" aria-label={t('mobile.loading')} className={styles.page}>
        <Skeleton shape="line" width="60%" />
        <Skeleton height={200} />
      </div>
    );
  }
  const { name, room } = shelf.data;
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{name}</h2>
      {room ? <p className={styles.sub}>{room.name}</p> : null}
      <Cabinet
        shelf={shelf.data}
        books={books.data}
        label={t('mshelves.unit', { name })}
        onOpenBook={(bookId) => navigate(`/books/${encodeURIComponent(bookId)}`)}
      />
      {books.data.length === 0 ? <p className={styles.sub}>{t('mshelves.emptyUnit')}</p> : <ShelfBookList books={books.data} />}
    </div>
  );
}

/** One piece of furniture, read only; a spine opens the book's card. */
export function ShelfPage() {
  const t = useT();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  return (
    <Screen
      title={t('mshelves.title')}
      leading={
        <Link
          to="/shelves"
          replace
          className={styles.back}
          aria-label={t('mshelves.backToList')}
          onClick={(e) => {
            // Back is the page the person came from (a book card, say); the list is the way out of a direct entry.
            if (!canGoBack) return;
            e.preventDefault();
            navigate(-1);
          }}
        >
          <Icon name="chevron-left" size={22} />
        </Link>
      }
    >
      <Body id={id} />
    </Screen>
  );
}
