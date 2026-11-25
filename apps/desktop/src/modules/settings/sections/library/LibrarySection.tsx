import { Button } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { Fact, FactList, SettingsBlock } from '../../SettingsBlock';
import { useSettingsSession } from '../../useSettingsSession';

export function LibrarySection() {
  const t = useT();
  const { me, connection, signOut } = useSettingsSession();
  const remote = connection?.kind === 'remote';

  return (
    <>
      <SettingsBlock title={t('settings.library.title')} description={t('settings.library.readOnly')}>
        <FactList>
          <Fact label={t('settings.library.name')}>{me?.library.name ?? connection?.library_name ?? t('shell.library.unknown')}</Fact>
          <Fact label={t('settings.library.connection')}>
            {remote ? t('settings.library.remote', { url: connection?.url ?? '' }) : t('settings.library.local')}
          </Fact>
          <Fact label={t('settings.library.role')}>{me ? t(`shell.role.${me.user.role}`) : '—'}</Fact>
        </FactList>
      </SettingsBlock>
      <SettingsBlock title={t('settings.library.switch.title')} description={t('settings.library.switch.description')}>
        <Button variant="secondary" icon="logout" onClick={signOut}>
          {t('settings.library.switch.action')}
        </Button>
      </SettingsBlock>
    </>
  );
}
