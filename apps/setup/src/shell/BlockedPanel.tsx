import { useState } from 'react';
import { Button, Icon } from '@bookeeper/ui/base';
import { useQuit } from '../bridge';
import { useT } from './i18n';
import { SetupLayout } from './SetupLayout';
import { useQuotes } from './quotes';
import styles from './BlockedPanel.module.css';

export interface BlockedPanelProps {
  kind: 'elevated' | 'incomplete' | 'unsupported';
}

/** The Setup cannot go on: say why, offer to close. */
export function BlockedPanel({ kind }: BlockedPanelProps) {
  const t = useT();
  const quit = useQuit();
  const { pick } = useQuotes();
  const [quote] = useState(() => pick('welcome'));
  return (
    <SetupLayout quote={quote} compact={false} panelHeight="short">
      <div className={styles.panel}>
        <div className={styles.lead}>
          <span className={styles.badge}>
            <Icon name="alert" size={17} />
          </span>
          <div>
            <h1 className={styles.title}>{t(`setup.blocked.${kind}.title`)}</h1>
            <p className={styles.text}>{t(`setup.blocked.${kind}.text`)}</p>
          </div>
        </div>
        <Button variant="primary" onClick={() => void quit(1)}>
          {t('setup.done.close')}
        </Button>
      </div>
    </SetupLayout>
  );
}
