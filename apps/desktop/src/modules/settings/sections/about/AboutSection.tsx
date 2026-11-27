import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { useSession } from '../../../../session';
import { APP_VERSION } from '../../appVersion';
import { Fact, FactList, SettingsBlock, SettingsFull } from '../../SettingsBlock';
import { serverMode } from './serverMode';
import { useAbout } from './useAbout';
import styles from './AboutSection.module.css';

export function AboutSection() {
  const t = useT();
  const { health, server } = useAbout();
  const unknown = health.isError ? t('settings.about.unavailable') : t('settings.about.loading');
  const phoneReady = server.data?.phone_ready;
  const connectionUrl = useSession((s) => s.connection?.url);

  return (
    <>
      <SettingsBlock title={t('settings.about.title')}>
        <FactList>
          <Fact label={t('settings.about.app')}>{APP_VERSION}</Fact>
          <Fact label={t('settings.about.server')}>{health.data?.version ?? unknown}</Fact>
          <Fact label={t('settings.about.mode')}>{server.data ? t(`settings.about.tls.${serverMode(server.data.tls, server.data.public_url, connectionUrl)}`) : unknown}</Fact>
        </FactList>
      </SettingsBlock>
      {phoneReady !== undefined ? (
        <SettingsFull>
        <aside className={styles.phone} aria-label={t('settings.about.phone.title')}>
          <Icon name={phoneReady ? 'check' : 'info'} size={18} />
          <div>
            <p className={styles.phoneTitle}>{t(phoneReady ? 'settings.about.phone.readyTitle' : 'settings.about.phone.title')}</p>
            <p className={styles.phoneText}>{t(phoneReady ? 'settings.about.phone.readyText' : 'settings.about.phone.text')}</p>
          </div>
        </aside>
        </SettingsFull>
      ) : null}
    </>
  );
}
