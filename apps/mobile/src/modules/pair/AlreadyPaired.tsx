import { useNavigate } from 'react-router';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { useSession } from '../../session';
import { AFTER_PAIR } from './usePairing';
import styles from './Pair.module.css';

/** A pairing link opened on a phone that already has a session. */
export function AlreadyPaired({ onAgain }: { onAgain: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const library = useSession((s) => s.me?.library.name);
  return (
    <Screen title={t('mpair.already.title')}>
      <EmptyState
        icon="phone"
        title={t('mpair.already.title')}
        text={library ? t('mpair.already.text', { library }) : t('mpair.already.textUnknown')}
        action={
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => navigate(AFTER_PAIR, { replace: true })}>
              {t('mpair.already.keep')}
            </Button>
            <Button onClick={onAgain}>{t('mpair.already.again')}</Button>
          </div>
        }
      />
    </Screen>
  );
}
