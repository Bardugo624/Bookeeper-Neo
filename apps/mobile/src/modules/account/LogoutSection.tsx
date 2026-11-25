import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import { useClient, useSession } from '../../session';
import styles from './Account.module.css';

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
    <section className={styles.card} aria-labelledby="account-logout">
      <h2 id="account-logout" className={styles.heading}>
        {t('maccount.logout.title')}
      </h2>
      <p className={styles.text}>{t('maccount.logout.text')}</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t('maccount.logout.action')}
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
        title={t('maccount.logout.confirmTitle')}
        description={t('maccount.logout.confirmText')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t('maccount.logout.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingLabel={t('maccount.logout.busy')}>
              {t('maccount.logout.confirm')}
            </Button>
          </>
        }
      />
    </section>
  );
}
