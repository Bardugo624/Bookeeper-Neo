import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, EmptyState, Spinner } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { useBook } from '../books/useBook';
import { useBookFiles } from '../books/useBookFiles';
import { ReaderBody } from './ReaderBody';
import { pickFile } from './pickFile';
import { useFileHash } from './useFileHash';
import styles from './ReaderView.module.css';

function Problem({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className={styles.state}>
      <EmptyState icon="info" title={title} text={text} />
      <Button onClick={onBack}>{t('dreader.back')}</Button>
    </div>
  );
}

/** `/read/:bookId`: the book, full window. Picks the file, then hands the reader its backend. */
export function ReaderView() {
  const t = useT();
  const { bookId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { role } = usePermission();
  // Guests have no notes and the API refuses them: they get the book's page.
  const guest = role === 'guest';
  const book = useBook(bookId);
  const files = useBookFiles(bookId, !guest);
  const file = files.data ? pickFile(files.data, params.get('file')) : null;
  const hash = useFileHash(bookId, file?.id ?? null);
  if (guest) return <Navigate to={`/books/${encodeURIComponent(bookId)}`} replace />;
  const back = () => navigate(`/books/${encodeURIComponent(bookId)}`, { replace: true });

  if (book.isError || files.isError || hash.isError) {
    return <Problem title={t('dreader.failed.title')} text={t('dreader.failed.text')} onBack={back} />;
  }
  if (files.data && !file) {
    return <Problem title={t('dreader.noFile.title')} text={t('dreader.noFile.text')} onBack={back} />;
  }
  if (!book.data || !file || !hash.data) {
    return (
      <div className={styles.state} role="status" aria-label={t('dreader.loading')}>
        <Spinner label={t('dreader.loading')} />
      </div>
    );
  }
  return <ReaderBody book={book.data} file={file} sha256={hash.data} onClose={back} />;
}
