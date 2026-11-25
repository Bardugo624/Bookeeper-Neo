import { IconButton } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { usePlatform } from '../platform';
import { useMaximized } from './useMaximized';
import styles from './TitleBar.module.css';

/** Draggable strip with the window controls; the controls are absent without a native window. */
export function TitleBar() {
  const t = useT();
  const win = usePlatform().window;
  const maximized = useMaximized(win);
  return (
    <div className={styles.bar} data-tauri-drag-region>
      {win ? (
        <div className={styles.controls}>
          <IconButton size="sm" icon="minimize" label={t('shell.window.minimize')} onClick={() => void win.minimize()} />
          <IconButton
            size="sm"
            icon={maximized ? 'restore' : 'maximize'}
            label={t(maximized ? 'shell.window.restore' : 'shell.window.maximize')}
            onClick={() => void win.toggleMaximize()}
          />
          <IconButton size="sm" icon="close" label={t('shell.window.close')} onClick={() => void win.close()} />
        </div>
      ) : null}
    </div>
  );
}
