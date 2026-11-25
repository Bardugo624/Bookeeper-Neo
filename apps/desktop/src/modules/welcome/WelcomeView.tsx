import { useState } from 'react';
import { useSession } from '../../session';
import { useT } from '../../app/i18n';
import { BrandPanel } from './BrandPanel';
import { CreateLocalCard } from './CreateLocalCard';
import { CreateServerCard } from './CreateServerCard';
import { JoinCard } from './JoinCard';
import { ReturningCard } from './ReturningCard';
import { useDiscover } from './useDiscover';
import { onPathKeyDown } from './usePathNav';
import type { PathId } from './types';
import styles from './WelcomeView.module.css';

/** "01 — Primo avvio": the four ways to get a library. */
export function WelcomeView() {
  const t = useT();
  const saved = useSession((s) => s.connection);
  const found = useDiscover();
  const [open, setOpen] = useState<PathId>('local');
  const [others, setOthers] = useState(false);
  const showPaths = !saved || others;

  return (
    <main className={styles.page}>
      <BrandPanel />
      <div className={styles.column}>
        <div className={styles.inner}>
          <h1 className={styles.heading}>{t('welcome.heading')}</h1>
          <p className={styles.sub}>{t('welcome.subheading')}</p>
          {saved ? <ReturningCard key={saved.id} connection={saved} onOther={showPaths ? undefined : () => setOthers(true)} /> : null}
          {showPaths ? (
            <div className={styles.cards} role="group" aria-label={t('welcome.paths.label')} onKeyDown={onPathKeyDown}>
              <CreateLocalCard open={open === 'local'} onOpen={() => setOpen('local')} />
              <JoinCard open={open === 'join'} onOpen={() => setOpen('join')} found={found} goTo={setOpen} />
              <CreateServerCard open={open === 'server'} onOpen={() => setOpen('server')} goTo={setOpen} />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
