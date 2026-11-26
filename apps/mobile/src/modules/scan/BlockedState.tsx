import { useState } from 'react';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ManualIsbn } from './ManualIsbn';
import styles from './Scan.module.css';

export interface BlockedStateProps {
  reason: 'denied' | 'unavailable';
  onRetry: () => void;
  onManual: (text: string) => boolean;
}

/** No camera to read from: how to turn it back on, and typing the ISBN instead. */
export function BlockedState({ reason, onRetry, onManual }: BlockedStateProps) {
  const t = useT();
  const [typing, setTyping] = useState(false);
  const denied = reason === 'denied';
  return (
    <div className={styles.blocked}>
      <EmptyState
        icon="alert"
        title={t(denied ? 'mscan.blocked.deniedTitle' : 'mscan.blocked.missingTitle')}
        text={t(denied ? 'mscan.blocked.deniedText' : 'mscan.blocked.missingText')}
        action={
          <div className={styles.blockedActions}>
            {typing ? null : (
              <Button variant="primary" onClick={() => setTyping(true)}>
                {t('mscan.blocked.manual')}
              </Button>
            )}
            <Button variant={typing ? 'secondary' : 'ghost'} onClick={onRetry}>
              {t('mscan.blocked.retry')}
            </Button>
          </div>
        }
      />
      {typing ? <ManualIsbn onSubmit={onManual} /> : null}
    </div>
  );
}
