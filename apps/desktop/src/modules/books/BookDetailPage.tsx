import { Link, useLocation, useParams } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { Button, EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { Book3D } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { DetailAside } from './DetailAside';
import { DetailToolbar } from './DetailToolbar';
import { MarkReadButton } from '../reading';
import { LendButton } from './LendButton';
import { authorsOf, type FromList } from './format';
import { eyebrowOf, metaFields } from './detailFields';
import { useBook } from './useBook';
import { mayHaveCover, useCover } from './useCover';
import styles from './BookDetailPage.module.css';

export function BookDetailPage() {
  const t = useT();
  const { id = '' } = useParams();
  const location = useLocation();
  const listPath = { pathname: '/books', search: (location.state as FromList | null)?.list ?? '' };
  const { data: book, error, isPending, refetch } = useBook(id);
  const canWrite = usePermission().can('write');
  const src = useCover(id, mayHaveCover(book?.cover_color));

  const back = (
    <Link to={listPath} className={styles.back}>
      <Icon name="chevron-left" size={16} />
      {t('books.detail.back')}
    </Link>
  );

  if (isPending) {
    return (
      <div className={styles.page}>
        {back}
        <div role="status" aria-label={t('books.detail.loading')} className={styles.loading}>
          <Skeleton width={240} height={360} />
          <Skeleton shape="line" width={320} height={32} />
        </div>
      </div>
    );
  }
  if (!book) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className={styles.page}>
        {back}
        {missing ? (
          <EmptyState
            icon="book"
            title={t('books.detail.notFound.title')}
            text={t('books.detail.notFound.text')}
            action={
              <Link to={listPath} className={styles.action}>
                {t('books.detail.notFound.back')}
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon="alert"
            title={t('books.detail.error.title')}
            text={t('books.detail.error.text')}
            action={<Button onClick={() => void refetch()}>{t('books.detail.error.retry')}</Button>}
          />
        )}
      </div>
    );
  }

  const authors = authorsOf(book);
  const facts = eyebrowOf(book);
  const fields = metaFields(book, t);
  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        {back}
        {canWrite ? <DetailToolbar book={book} listPath={listPath} /> : null}
      </div>
      <article className={styles.layout}>
        <div className={styles.cover}>
          <Book3D
            title={book.title}
            author={authors || undefined}
            src={src}
            color={book.cover_color ?? undefined}
            pages={book.page_count ?? undefined}
          />
          <MarkReadButton book={book} />
          {canWrite ? <LendButton book={book} /> : null}
        </div>
        <div className={styles.main}>
          <h1 className={styles.title}>{book.title}</h1>
          {book.subtitle ? <p className={styles.subtitle}>{book.subtitle}</p> : null}
          {authors || facts ? (
            <p className={styles.byline}>
              {authors ? <span className={styles.authors}>{authors}</span> : null}
              {facts ? <span className={styles.facts}>{facts}</span> : null}
            </p>
          ) : null}
          {book.description ? <p className={styles.description}>{book.description}</p> : null}
          {fields.length > 0 ? (
            <dl className={styles.meta}>
              {fields.map((f) => (
                <div key={f.id} className={styles.metaItem}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <DetailAside book={book} />
      </article>
    </div>
  );
}
