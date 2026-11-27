import { Button, DangerAction, DangerZone } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { Fact, FactList, SettingsBlock, SettingsFull } from '../../SettingsBlock';
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
      <SettingsFull>
      <DangerZone title={t('settings.danger.title')} headingLevel="h2">
        <DangerAction
          title={t('settings.danger.signOut.title')}
          consequence={t('settings.danger.signOut.consequence')}
          action={
            <Button variant="danger" icon="logout" onClick={signOut}>
              {t('settings.account.signOut.action')}
            </Button>
          }
        />
      </DangerZone>
      </SettingsFull>
    </>
  );
}
