import { DialogPanel, type DialogProps } from './Dialog';
import styles from './Drawer.module.css';

export type DrawerProps = DialogProps;

/** A dialog that enters from the right edge, 420px wide. */
export function Drawer(props: DrawerProps) {
  return <DialogPanel {...props} panelClassName={styles.drawer} />;
}
