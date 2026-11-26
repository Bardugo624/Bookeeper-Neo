import { useEffect } from 'react';
import { usePlatform } from '../../platform';
import { useSession } from '../../session';

const KEY = 'bookeeper.scan.libraryId';

/**
 * The library this phone belongs to. `GET /me` fails when the app opens without a network, so the last
 * known id is kept in the platform storage and stands in until `me` is there: the local index stays usable.
 */
export function useLibraryId(): string | undefined {
  const { storage } = usePlatform();
  const fromMe = useSession((s) => s.me?.library.id);
  useEffect(() => {
    if (fromMe) {
      try {
        storage.set(KEY, fromMe);
      } catch {
        /* a full or blocked store only costs the offline start */
      }
    }
  }, [fromMe, storage]);
  if (fromMe) return fromMe;
  try {
    return storage.get(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
