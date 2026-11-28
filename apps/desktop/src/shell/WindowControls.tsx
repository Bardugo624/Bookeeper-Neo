import { IconButton } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { usePlatform } from '../platform';
import { useMaximized } from './useMaximized';
import styles from './WindowControls.module.css';

/** Minimise, maximise/restore and close of the native window; nothing where there is no native window. */
export function WindowControls() {
  const t = useT();
  const win = usePlatform().window;
  const maximized = useMaximized(win);
  if (!win) return null;
  return (
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
  );
}
