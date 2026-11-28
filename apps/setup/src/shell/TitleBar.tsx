import { IconButton } from '@bookeeper/ui/base';
import { Tooltip } from '@bookeeper/ui/overlays';
import { useWindowControls } from '../bridge';
import { useT } from './i18n';
import mark from './mark.png';
import styles from './TitleBar.module.css';

export interface TitleBarProps {
  /** An install or uninstall is running: closing is off. */
  busy: boolean;
}

/** The frameless window's bar: draggable, with minimize and close. */
export function TitleBar({ busy }: TitleBarProps) {
  const t = useT();
  const controls = useWindowControls();
  const busyText = t('setup.window.busy');
  return (
    <div className={styles.bar} data-tauri-drag-region>
      <div className={styles.brand}>
        <img className={styles.mark} src={mark} alt="" width={18} height={18} />
        <span className={styles.word}>Bookeeper</span>
      </div>
      <div className={styles.controls}>
        <IconButton icon="minimize" size="sm" label={t('setup.window.minimize')} onClick={controls.minimize} />
        {busy ? (
          <Tooltip content={busyText} side="bottom">
            <span className={styles.hint} role="group" aria-label={busyText} tabIndex={0}>
              <IconButton icon="close" size="sm" label={t('setup.window.close')} disabled />
            </span>
          </Tooltip>
        ) : (
          <IconButton icon="close" size="sm" label={t('setup.window.close')} onClick={controls.close} />
        )}
      </div>
    </div>
  );
}
