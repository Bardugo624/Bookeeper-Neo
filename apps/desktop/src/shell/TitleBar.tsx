import { WindowControls } from './WindowControls';
import styles from './TitleBar.module.css';

/** Draggable strip with the window controls; the controls are absent without a native window. */
export function TitleBar() {
  return (
    <div className={styles.bar} data-tauri-drag-region>
      <WindowControls />
    </div>
  );
}
