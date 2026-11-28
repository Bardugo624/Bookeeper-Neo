import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ReaderApp } from '@bookeeper/reader/app';
import { Spinner } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app/i18n';
import { ErrorState } from '../../kit';
import { usePlatform } from '../../platform';
import { useOnline } from '../../shell/hooks';
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
      // A row without the file id could not resume or sync its position: it does not open the reader.
      .then((all) => live && setKept(all.find((b) => b.bookId === bookId && !!b.fileId) ?? null));
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
    file: { id: copy.fileId, format: copy.format, name: copy.name, sha256: copy.sha256, size_bytes: copy.sizeBytes, created_at: copy.savedAt, missing: false },
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
  const client = useClient();
  const online = useOnline();

  // A cold start without network leaves `me` empty: the session is read again, on «Riprova» and when the network returns.
  const hasMe = me !== null;
  // `settled` says a reload made with the network up ended without a session: only then is there nothing left to wait for.
  // A reload that failed while offline says nothing about the server.
  const [settled, setSettled] = useState(false);
  // Only the latest reload speaks: an older one that fails late does not end the wait of a newer one.
  const reloads = useRef(0);
  const reloadSession = useMemo(
    () => (withNetwork: boolean) => {
      const seq = ++reloads.current;
      setSettled(false);
      client
        .me()
        .then((fresh) => useSession.setState({ me: fresh, status: 'ready' }))
        .catch(() => seq === reloads.current && setSettled(withNetwork));
    },
    [client],
  );
  // The kept copy on screen needs no session: reading it again would only close the reader under the person.
  useEffect(() => {
    if (online && !hasMe && copy === null) reloadSession(true);
  }, [online, hasMe, copy, reloadSession]);
  // Once the kept copy is open it stays open: a session or listing arriving later does not swap the reader.
  const copyShownFor = useRef<string | null>(null);

  // Without a session (the app opened with no network) or without the server's answer, the copy on the phone is what there is.
  // A failed background refetch keeps the cached answer: that still counts as an answer.
  const serverFailed = (files.isError && !files.data) || (book.isError && !book.data);
  if (copy === undefined && (!me || serverFailed)) {
    return (
      <div className={styles.state}>
        <Spinner label={t('mreader.loading')} />
      </div>
    );
  }
  if (copy && (copyShownFor.current === bookId || !me || serverFailed)) {
    copyShownFor.current = bookId;
    const kept = fromCopy(copy);
    return <Reading bookId={bookId} title={kept.title} authors={[]} file={kept.file} />;
  }
  if (me && !allowed) return <Navigate to={back} replace />;
  const offline = !online;
  if (!me && !offline && !settled) {
    return (
      <div className={styles.state}>
        <Spinner label={t('mreader.loading')} />
      </div>
    );
  }
  if (!me && !offline) return <Navigate to={back} replace />;
  if (!me || serverFailed) {
    return (
      <div className={styles.state}>
        <ErrorState
          message={offline ? t('mreader.offline.missing') : t('mreader.error.text')}
          onRetry={() => {
            if (!me) reloadSession(online);
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
