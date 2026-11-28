import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ReaderApp } from '@bookeeper/reader/app';
import { Spinner } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app/i18n';
import { ErrorState } from '../../kit';
import { usePlatform } from '../../platform';
import { createAuthTransport, useClient, useSession } from '../../session';
import { InstallSheet } from './InstallSheet';
import { createMobileBackend } from './mobileBackend';
import { opfsLibrary, type OfflineBook } from './opfsLibrary';
import { pickFile, type BookFile } from './pickFile';
import { readerQueue } from './queue';
import { useAppDark } from './useAppDark';
import { useReaderFiles } from './useBookFiles';
import { useReaderBook } from './useReaderBook';
import { useOfflineMenu } from './useOfflineMenu';
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
  const [explain, setExplain] = useState(false);
  const menuItems = useOfflineMenu({ bookId, file }, () => setExplain(true));

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
        // The copy kept on the phone opens first; without it and without a network the reader says so.
        offline: { read: (sha) => opfsLibrary().open(sha) },
        online: () => platform.network.online(),
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
        menuItems={menuItems}
        onClose={onClose}
      />
      <InstallSheet open={explain} onOpenChange={setExplain} />
    </div>
  );
}

/** The copy of this book kept on the phone: `undefined` while the list is read, `null` when there is none. */
function useKeptCopy(bookId: string): OfflineBook | null | undefined {
  const [kept, setKept] = useState<OfflineBook | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void opfsLibrary()
      .list()
      .catch(() => [] as OfflineBook[])
      .then((all) => live && setKept(all.find((b) => b.bookId === bookId) ?? null));
    return () => {
      live = false;
    };
  }, [bookId]);
  return kept;
}

/** What the phone knows of a kept copy, for when the server cannot say. */
function fromCopy(copy: OfflineBook): { title: string; file: BookFile } {
  return {
    title: copy.name.replace(/\.[^./]+$/, ''),
    file: { id: '', format: copy.format, name: copy.name, sha256: copy.sha256, size_bytes: copy.sizeBytes, created_at: copy.savedAt, missing: false },
  };
}

/** `/read/:bookId`: picks the file, and opens the reader on the whole screen. */
export function ReaderRoute() {
  const t = useT();
  const platform = usePlatform();
  const { bookId = '' } = useParams();
  const [search] = useSearchParams();
  const me = useSession((s) => s.me);
  const allowed = canRead(me?.user.role);
  const book = useReaderBook(bookId, allowed);
  const files = useReaderFiles(bookId, allowed);
  const copy = useKeptCopy(bookId);
  const back = `/books/${encodeURIComponent(bookId)}`;

  // Without a session (the app opened with no network) or without the server's answer, the copy on the phone is what there is.
  const serverFailed = files.isError || book.isError;
  if (copy === undefined && (!me || serverFailed)) {
    return (
      <div className={styles.state}>
        <Spinner label={t('mreader.loading')} />
      </div>
    );
  }
  if (copy && (!me || serverFailed)) {
    const kept = fromCopy(copy);
    return <Reading bookId={bookId} title={kept.title} authors={[]} file={kept.file} />;
  }
  if (me && !allowed) return <Navigate to={back} replace />;
  if (!me) return <Navigate to={back} replace />;
  if (serverFailed) {
    const offline = !platform.network.online();
    return (
      <div className={styles.state}>
        <ErrorState
          message={offline ? t('mreader.offline.missing') : t('mreader.error.text')}
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
