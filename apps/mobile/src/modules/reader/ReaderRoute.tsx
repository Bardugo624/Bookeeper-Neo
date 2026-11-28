import { useMemo, useRef } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ReaderApp } from '@bookeeper/reader/app';
import { Spinner } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app/i18n';
import { ErrorState } from '../../kit';
import { usePlatform } from '../../platform';
import { createAuthTransport, useClient, useSession } from '../../session';
import { createMobileBackend } from './mobileBackend';
import { pickFile, type BookFile } from './pickFile';
import { readerQueue } from './queue';
import { useAppDark } from './useAppDark';
import { useReaderFiles } from './useBookFiles';
import { useReaderBook } from './useReaderBook';
import { useThemeColor } from './useThemeColor';
import styles from './Reader.module.css';

/** Guests read only the details: the file routes answer 403 to them. */
const canRead = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';

function Reading({ bookId, title, authors, file }: { bookId: string; title: string; authors: string[]; file: BookFile }) {
  const locale = useLocale();
  const platform = usePlatform();
  const client = useClient();
  const navigate = useNavigate();
  const location = useLocation();
  const appDark = useAppDark();
  const deviceId = useSession((s) => s.tokens?.device_id) ?? '';
  const host = useRef<HTMLDivElement>(null);
  useThemeColor(host);

  const backend = useMemo(
    () =>
      createMobileBackend({
        client,
        transport: createAuthTransport(platform),
        bookId,
        fileId: file.id,
        deviceId,
        queue: readerQueue(),
        file: { sha256: file.sha256, format: file.format },
      }),
    [client, platform, bookId, file.id, file.sha256, file.format, deviceId],
  );
  // «Indietro» goes back where the person was; with nothing behind (a link), to the book.
  const onClose = () => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const behind = typeof idx === 'number' ? idx > 0 : location.key !== 'default';
    if (behind) void navigate(-1);
    else void navigate(`/books/${encodeURIComponent(bookId)}`, { replace: true });
  };
  return (
    <div ref={host} className={styles.host}>
      <ReaderApp
        backend={backend}
        book={{ id: bookId, title, authors }}
        file={{ id: file.id, sha256: file.sha256, format: file.format, name: file.name }}
        platform="phone"
        locale={locale}
        appDark={appDark}
        onClose={onClose}
      />
    </div>
  );
}

/** `/read/:bookId`: picks the file, and opens the reader on the whole screen. */
export function ReaderRoute() {
  const t = useT();
  const { bookId = '' } = useParams();
  const [search] = useSearchParams();
  const role = useSession((s) => s.me?.user.role);
  const allowed = canRead(role);
  const book = useReaderBook(bookId, allowed);
  const files = useReaderFiles(bookId, allowed);
  const back = `/books/${encodeURIComponent(bookId)}`;

  if (!allowed) return <Navigate to={back} replace />;
  if (files.isError || book.isError) {
    return (
      <div className={styles.state}>
        <ErrorState
          message={t('mreader.error.text')}
          onRetry={() => {
            void files.refetch();
            void book.refetch();
          }}
        />
      </div>
    );
  }
  if (!files.data || !book.data) {
    return (
      <div className={styles.state}>
        <Spinner label={t('mreader.loading')} />
      </div>
    );
  }
  const file = pickFile(files.data, search.get('file'));
  if (!file) return <Navigate to={back} replace />;
  return <Reading bookId={bookId} title={book.data.title} authors={book.data.authors} file={file} />;
}
