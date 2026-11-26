import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { ApiError } from '@bookeeper/api';
import { EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT, type Translate } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { ReadingBlock } from '../reading';
import { TagsBlock } from '../tags';
import { useSession } from '../../session';
import { Description } from './Description';
import { canEditBooks } from './editModel';
import { OwnerLine, ReadersBlock } from './People';
import { LoanBlock, WhereBlock } from './Placement';
import type { FromList } from './searchState';
import { mayHaveCover, useCover } from './useCover';
import { useBook } from './useBook';
import blocks from './Blocks.module.css';
import styles from './BookDetailPage.module.css';

function metaRows(t: Translate, book: BookOut): [string, string][] {
  const rows: [string, string | number | null | undefined][] = [
    [t('msearch.detail.meta.publisher'), book.publisher],
    [t('msearch.detail.meta.year'), book.published_year],
    [t('msearch.detail.meta.pages'), book.page_count],
    [t('msearch.detail.meta.language'), book.language],
    [t('msearch.detail.meta.genre'), book.genre],
    [t('msearch.detail.meta.format'), book.format],
    [t('msearch.detail.meta.isbn13'), book.isbn_13],
    [t('msearch.detail.meta.isbn10'), book.isbn_10],
  ];
  return rows.flatMap(([label, value]) => (value === null || value === undefined || value === '' ? [] : [[label, String(value)]]));
}

function Detail({ book }: { book: BookOut }) {
  const t = useT();
  const src = useCover(book.id, mayHaveCover(book.cover_color));
  const rows = metaRows(t, book);
  const description = book.description?.trim();
  return (
    <article className={styles.page}>
      <div className={styles.hero}>
        <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={180} />
        <h2 className={styles.title}>{book.title}</h2>
        {book.subtitle ? <p className={styles.subtitle}>{book.subtitle}</p> : null}
        {book.authors.length > 0 ? <p className={styles.authors}>{book.authors.join(', ')}</p> : null}
        <OwnerLine book={book} />
      </div>
      <WhereBlock book={book} />
      <LoanBlock book={book} />
      <ReadingBlock book={book} />
      <ReadersBlock bookId={book.id} />
      <TagsBlock book={book} />
      {description ? (
        <section className={blocks.block} aria-labelledby="desc-title">
          <h2 id="desc-title" className={blocks.heading}>
            {t('msearch.detail.description.title')}
          </h2>
          <Description text={description} />
        </section>
      ) : null}
      {rows.length > 0 ? (
        <section className={blocks.block} aria-labelledby="meta-title">
          <h2 id="meta-title" className={blocks.heading}>
            {t('msearch.detail.meta.title')}
          </h2>
          <dl className={blocks.meta}>
            {rows.map(([label, value]) => (
              <div key={label} className={styles.metaRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </article>
  );
}

function Loading() {
  const t = useT();
  return (
    <div role="status" aria-label={t('mobile.loading')} className={styles.page}>
      <div className={styles.hero}>
        <Skeleton width={180} height={270} />
        <Skeleton shape="line" width="60%" />
        <Skeleton shape="line" width="40%" />
      </div>
      <Skeleton height={84} />
    </div>
  );
}

/** One book, read only. The first block says where it stands on the shelves. */
export function BookDetailPage() {
  const t = useT();
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as FromList | null)?.list ?? '';
  const book = useBook(id);
  const canEdit = useSession((s) => canEditBooks(s.me?.user.role));

  let body;
  if (book.data) body = <Detail book={book.data} />;
  else if (book.isError && book.error instanceof ApiError && book.error.status === 404) {
    body = <EmptyState icon="book" title={t('msearch.detail.notFound.title')} text={t('msearch.detail.notFound.text')} />;
  } else if (book.isError) {
    body = <ErrorState message={apiErrorMessage(t, book.error)} onRetry={() => void book.refetch()} />;
  } else body = <Loading />;

  return (
    <Screen
      title={book.data?.title ?? t('msearch.title')}
      actions={
        book.data && canEdit ? (
          <Link to={`/books/${encodeURIComponent(id)}/edit`} state={location.state} className={styles.edit}>
            {t('msearch.detail.edit')}
          </Link>
        ) : undefined
      }
      leading={
        <Link
          to={{ pathname: '/search', search: from }}
          replace
          className={styles.back}
          aria-label={t('msearch.detail.back')}
          onClick={(e) => {
            // Back is the page the person came from; the list is only the way out of a direct entry.
            if (location.key === 'default') return;
            e.preventDefault();
            navigate(-1);
          }}
        >
          <Icon name="chevron-left" size={22} />
        </Link>
      }
    >
      {body}
    </Screen>
  );
}
