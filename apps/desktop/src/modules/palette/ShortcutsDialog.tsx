import { Kbd } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { isMac, useOverlays, useT, SHORTCUT_ROWS } from '../../app';
import styles from './Palette.module.css';

export function ShortcutsDialog() {
  const t = useT();
  const open = useOverlays((s) => s.shortcuts);
  const close = useOverlays((s) => s.closeShortcuts);
  const mod = t(isMac() ? 'palette.keys.modMac' : 'palette.keys.mod');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={t('palette.shortcuts.title')} closeLabel={t('shell.toast.close')}>
      <table className={styles.table}>
        <tbody>
          {SHORTCUT_ROWS.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={styles.keys}>
                {row.keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && row.id === 'goTo' ? <span className={styles.then}>{t('palette.shortcuts.then')}</span> : null}
                    <Kbd>{k === 'mod' ? mod : k}</Kbd>{' '}
                  </span>
                ))}
              </th>
              <td>{t(`palette.shortcuts.${row.id}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
