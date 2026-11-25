import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import { usePlatform } from '../../platform';
import { SESSION_KEY, useClient, useSession } from '../../session';
import styles from './Account.module.css';

/** Only a request that never reached the server leaves the device registered there. */
const unreachable = (e: unknown) => !(e instanceof ApiError) || e.code === 'network' || e.status === 0;

/** "Scollega questo telefono": confirmation, core logout, local sign-out, then `/pair`. */
export function LogoutSection() {
  const t = useT();
  const client = useClient();
  const { storage } = usePlatform();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  const leave = () => {
    useSession.getState().expire();
    navigate('/pair', { replace: true });
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await client.logout();
    } catch (e) {
      if (unreachable(e)) {
        // The tokens go now; the sheet stays to say the server still lists this phone.
        storage.remove(SESSION_KEY);
        setBusy(false);
        setOffline(true);
        return;
      }
    }
    leave();
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
          if (busy) return;
          // Closing after the failure is the way out: the phone is already disconnected.
          if (!next && offline) return leave();
          setOpen(next);
        }}
        title={t('maccount.logout.confirmTitle')}
        description={offline ? undefined : t('maccount.logout.confirmText')}
        footer={
          offline ? (
            <Button variant="primary" onClick={leave}>
              {t('maccount.logout.understood')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                {t('maccount.logout.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingLabel={t('maccount.logout.busy')}>
                {t('maccount.logout.confirm')}
              </Button>
            </>
          )
        }
      >
        {offline ? <p className={styles.text}>{t('maccount.logout.offline')}</p> : null}
      </BottomSheet>
    </section>
  );
}
