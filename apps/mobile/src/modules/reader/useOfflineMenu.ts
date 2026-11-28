import type { MenuEntry } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { useOfflineFile, type OfflineTarget } from './useOffline';

/** The «⋯» item of the reader: download, progress with a way to cancel, or take the book off the phone. */
export function useOfflineMenu(target: OfflineTarget, explain: () => void): MenuEntry[] {
  const t = useT();
  const offline = useOfflineFile(target);
  if (offline.status === 'saving') {
    return [{ id: 'offline', label: t('mreader.offline.menuCancel', { percent: Math.round(offline.progress * 100) }), onSelect: offline.cancel }];
  }
  if (offline.status === 'saved') return [{ id: 'offline', label: t('mreader.offline.remove'), onSelect: offline.remove }];
  return [
    {
      id: 'offline',
      label: t('mreader.offline.download'),
      onSelect: () => {
        if (offline.start() === 'explain') explain();
      },
    },
  ];
}
