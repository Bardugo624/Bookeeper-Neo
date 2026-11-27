import { Button, Icon } from '@bookeeper/ui/base';
import type { FolderCheck } from '../bridge';
import { useT } from '../shell';
import { FolderField } from './FolderField';
import { PanelTitle } from './PanelTitle';
import { Switch } from './Switch';
import styles from './Customize.module.css';
import panel from './panel.module.css';

export interface CustomizeProps {
  version: string;
  installedBytes: number;
  dir: string;
  check: FolderCheck | null;
  /** The folder check has not answered yet. */
  checking: boolean;
  desktopIcon: boolean;
  autostart: boolean;
  onPickFolder(): void;
  onDesktopIcon(on: boolean): void;
  onAutostart(on: boolean): void;
  onLess(): void;
  onInstall(): void;
}

/** The tall panel: folder, desktop icon, the fixed Start menu entry and opening at sign-in. */
export function Customize(props: CustomizeProps) {
  const t = useT();
  const blocked = props.check?.problem != null || props.checking;
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div>
          <PanelTitle>{t('setup.customize.title')}</PanelTitle>
          <p className={panel.meta}>{t('setup.customize.meta', { version: props.version })}</p>
        </div>
        <Button variant="ghost" icon="chevron-up" onClick={props.onLess}>
          {t('setup.customize.less')}
        </Button>
      </div>
      <FolderField dir={props.dir} check={props.check} needBytes={props.installedBytes} onPick={props.onPickFolder} />
      <div className={styles.options}>
        <Switch checked={props.desktopIcon} onChange={props.onDesktopIcon} label={t('setup.customize.desktop')} />
        <p className={styles.fixed}>
          <Icon name="check" />
          {t('setup.customize.startMenu')}
        </p>
        <Switch
          checked={props.autostart}
          onChange={props.onAutostart}
          label={t('setup.customize.autostart')}
          note={t('setup.customize.autostartNote')}
        />
      </div>
      <div className={styles.foot}>
        <Button variant="primary" disabled={blocked} onClick={props.onInstall}>
          {t('setup.install.go')}
        </Button>
      </div>
    </div>
  );
}
