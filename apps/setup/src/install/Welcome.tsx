import { Button, Icon } from '@bookeeper/ui/base';
import { useT, useLocale, formatBytes } from '../shell';
import { PanelTitle } from './PanelTitle';
import styles from './Welcome.module.css';
import panel from './panel.module.css';

export interface WelcomeProps {
  version: string;
  installedBytes: number;
  dir: string;
  desktopIcon: boolean;
  autostart: boolean;
  onCustomize(): void;
  onInstall(): void;
}

/** The first screen: what will be installed, where, with which icons. */
export function Welcome({ version, installedBytes, dir, desktopIcon, autostart, onCustomize, onInstall }: WelcomeProps) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className={panel.row}>
      <div>
        <PanelTitle>{t('setup.install.title')}</PanelTitle>
        <p className={panel.meta}>{t('setup.install.meta', { version, size: formatBytes(installedBytes, locale) })}</p>
        <ul className={styles.summary}>
          <li>
            <Icon name="folder" />
            <span className={styles.dir}>{dir}</span>
          </li>
          <li>
            <Icon name="monitor" />
            {t(desktopIcon ? 'setup.install.icons.both' : 'setup.install.icons.start')}
          </li>
          {autostart ? (
            <li>
              <Icon name="power" />
              {t('setup.install.autostart')}
            </li>
          ) : null}
        </ul>
      </div>
      <div className={panel.acts}>
        <Button variant="secondary" onClick={onCustomize}>
          {t('setup.install.customize')}
        </Button>
        <Button variant="primary" onClick={onInstall}>
          {t('setup.install.go')}
        </Button>
      </div>
    </div>
  );
}
