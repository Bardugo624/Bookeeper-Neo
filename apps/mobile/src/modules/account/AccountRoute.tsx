import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { AboutSection } from './AboutSection';
import { AppearanceSection } from './AppearanceSection';
import { InstallSection } from './InstallSection';
import { LogoutSection } from './LogoutSection';
import { WhoSection } from './WhoSection';
import type { Installer } from './install';
import styles from './Account.module.css';

/** `/account`: who this phone is, how the app looks, installation, versions and sign-out. */
export function AccountRoute({ installer }: { installer: Installer }) {
  const t = useT();
  return (
    <Screen title={t('maccount.title')}>
      <div className={styles.content}>
        <WhoSection />
        <AppearanceSection />
        <InstallSection installer={installer} />
        <AboutSection />
        <LogoutSection />
      </div>
    </Screen>
  );
}
