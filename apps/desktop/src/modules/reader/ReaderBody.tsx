import { useMemo } from 'react';
import type { BookOut } from '@bookeeper/api';
import { ReaderApp } from '@bookeeper/reader/app';
import { idbQueue } from '@bookeeper/reader/data';
import { useLocale, useT } from '../../app';
import { usePlatform } from '../../platform';
import { useClient, useSession } from '../../session';
import { WindowControls } from '../../shell/WindowControls';
import type { BookFile } from '../books/bookFileApi';
import { createDesktopBackend } from './desktopBackend';
import { useAppDark } from './useAppDark';
import { useWindowTitle } from './useWindowTitle';
import styles from './ReaderView.module.css';

/** The reader, once the book, the file and its hash are known. */
export function ReaderBody({ book, file, sha256, onClose }: { book: BookOut; file: BookFile; sha256: string; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const platform = usePlatform();
  const client = useClient();
  const connection = useSession((s) => s.connection);
  const appDark = useAppDark();
  useWindowTitle(book.title);
  const connectionId = connection?.id ?? '';
  const deviceId = connection?.device_id ?? 'desktop';
  const saveFilterName = t('dreader.save.filter');
  const backend = useMemo(
    () =>
      createDesktopBackend({
        platform,
        client,
        queue: idbQueue('bookeeper-reader'),
        bookId: book.id,
        file: { id: file.id, sha256, format: file.format },
        connection: { id: connectionId, deviceId, token: () => useSession.getState().connection?.access_token ?? null },
        saveFilterName,
      }),
    [platform, client, book.id, file.id, file.format, sha256, connectionId, deviceId, saveFilterName],
  );
  return (
    <div className={styles.root}>
      <ReaderApp
        backend={backend}
        book={{ id: book.id, title: book.title, authors: book.authors }}
        file={{ id: file.id, sha256, format: file.format, name: file.name }}
        platform="desktop"
        locale={locale}
        appDark={appDark}
        topEnd={<WindowControls />}
        onClose={onClose}
      />
    </div>
  );
}
