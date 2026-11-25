import { Outlet } from 'react-router';
import { cx } from '../kit/cx';
import { Banners, useBannersVisible } from './Banners';
import styles from './AppFrame.module.css';

/** The full-height column of the app: banners on top, the current page below. */
export function AppFrame() {
  const banners = useBannersVisible();
  return (
    <div className={cx(styles.frame, banners && styles.banded)}>
      <Banners />
      <div className={styles.page}>
        <Outlet />
      </div>
    </div>
  );
}
