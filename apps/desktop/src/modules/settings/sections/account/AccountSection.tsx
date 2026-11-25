import { Button } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { Fact, FactList, SettingsBlock } from '../../SettingsBlock';
import { useSettingsSession } from '../../useSettingsSession';
import { PasswordForm } from './PasswordForm';

export function AccountSection() {
  const t = useT();
  const { me, connection, signOut } = useSettingsSession();
  const email = me?.user.email ?? null;

  return (
    <>
      <SettingsBlock title={t('settings.account.profile.title')} description={t('settings.account.profile.readOnly')}>
        <FactList>
          <Fact label={t('settings.account.profile.name')}>{me?.user.display_name ?? connection?.user_name ?? '—'}</Fact>
          <Fact label={t('settings.account.profile.email')}>{email ?? t('settings.account.profile.noEmail')}</Fact>
        </FactList>
      </SettingsBlock>
      <SettingsBlock
        title={t('settings.account.password.title')}
        description={t(connection?.kind === 'local' ? 'settings.account.password.whyLocal' : 'settings.account.password.why')}
      >
        {email ? <PasswordForm /> : <p>{t('settings.account.password.needsEmail')}</p>}
      </SettingsBlock>
      <SettingsBlock title={t('settings.account.signOut.title')} description={t('settings.account.signOut.description')}>
        <Button variant="secondary" icon="logout" onClick={signOut}>
          {t('settings.account.signOut.action')}
        </Button>
      </SettingsBlock>
    </>
  );
}
