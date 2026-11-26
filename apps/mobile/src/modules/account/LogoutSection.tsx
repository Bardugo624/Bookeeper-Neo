import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { Button, DangerAction, DangerZone } from '@bookeeper/ui/base';
import { Dialog, useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import styles from './Account.module.css';
import { useClient, useSession } from '../../session';

/** Only a request that never reached the server leaves the device registered there. */
const unreachable = (e: unknown) => !(e instanceof ApiError) || e.code === 'network' || e.status === 0;

/** "Scollega questo telefono": confirmation, core logout, local sign-out, then `/pair`. */
export function LogoutSection() {
  const t = useT();
  const client = useClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    let offline = false;
    try {
      await client.logout();
    } catch (e) {
      offline = unreachable(e);
    }
    // Tokens and in-memory state go either way; the session gate then leads to `/pair`.
    useSession.getState().expire();
    if (offline) toast.show({ title: t('maccount.logout.offlineTitle'), description: t('maccount.logout.offline'), tone: 'warn' });
    navigate('/pair', { replace: true });
  };

  return (
    <>
      <DangerZone title={t('maccount.danger.title')} headingLevel="h2">
        <DangerAction
          title={t('maccount.logout.title')}
          consequence={t('maccount.logout.text')}
          action={
            <Button variant="danger" className={styles.touch} onClick={() => setOpen(true)}>
              {t('maccount.logout.action')}
            </Button>
          }
        />
      </DangerZone>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
        tone="danger"
        title={t('maccount.logout.confirmTitle')}
        description={t('maccount.logout.confirmText')}
        closeLabel={t('mobile.close')}
        footer={
          <>
            <Button variant="ghost" className={styles.touch} onClick={() => setOpen(false)} disabled={busy}>
              {t('maccount.logout.cancel')}
            </Button>
            <Button variant="danger" className={styles.touch} onClick={() => void confirm()} loading={busy} loadingLabel={t('maccount.logout.busy')}>
              {t('maccount.logout.confirm')}
            </Button>
          </>
        }
      />
    </>
  );
}
