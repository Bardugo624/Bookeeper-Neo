import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePlatform } from '../../platform';
import { createAuthTransport } from '../../session';
import { needsHomeScreen } from './iosInstall';
import { cancelOffline, downloadOffline, offlineState, refreshOffline, removeOffline, subscribeOffline, type OfflineState } from './offlineStore';

/** The file a copy on the phone is made of. */
export interface OfflineTarget {
  bookId: string;
  file: { id: string; sha256: string; format: string; name: string; size_bytes: number };
}

export interface OfflineFile extends OfflineState {
  /** Starts the save; on an iPhone in Safari it asks to show the explanation instead and returns `'explain'`. */
  start(): 'explain' | 'started';
  cancel(): void;
  remove(): void;
}

/** The offline copy of one file: shared by the book page and the reader's menu. */
export function useOfflineFile(target: OfflineTarget): OfflineFile {
  const platform = usePlatform();
  const { sha256 } = target.file;
  const state = useSyncExternalStore(subscribeOffline, () => offlineState(sha256));
  useEffect(() => void refreshOffline(sha256), [sha256]);
  const { bookId, file } = target;
  const start = useCallback((): 'explain' | 'started' => {
    if (needsHomeScreen()) return 'explain';
    void downloadOffline(
      { sha256: file.sha256, format: file.format, name: file.name, bookId, fileId: file.id, sizeBytes: file.size_bytes },
      createAuthTransport(platform),
    );
    return 'started';
  }, [platform, bookId, file.id, file.sha256, file.format, file.name, file.size_bytes]);
  return {
    ...state,
    start,
    cancel: () => cancelOffline(sha256),
    remove: () => void removeOffline(sha256),
  };
}
