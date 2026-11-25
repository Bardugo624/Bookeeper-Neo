import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { UpdateDialog } from './UpdateDialog';
import { useUpdates } from './useUpdates';
import styles from './updates.module.css';

/** A non-blocking notice above the content; nothing at all when updates are off or hidden. */
export function UpdateBanner() {
  const t = useT();
  const updates = useUpdates();
  const [open, setOpen] = useState(false);
  const { result, dismissed, installing, controller } = updates;
  if (!updates.enabled || result?.state !== 'available') return null;
  if (dismissed === result.version && !installing && !open) return null;

  return (
    <>
      <aside className={styles.banner} role="status">
        <span className={styles.text}>{t('updates.banner.available', { version: result.version })}</span>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          {t('updates.banner.notes')}
        </Button>
        <Button size="sm" variant="ghost" disabled={installing} onClick={() => controller?.dismiss(result.version)}>
          {t('updates.banner.later')}
        </Button>
      </aside>
      <UpdateDialog open={open} onOpenChange={setOpen} updates={updates} />
    </>
  );
}
