import { PillTabs } from '@bookeeper/ui/overlays';
import { useT, useLocalePreference, type LocalePreference } from '../../../../app/i18n';
import { useTheme, type Theme } from '../../../../theme';
import { SettingsBlock } from '../../SettingsBlock';

export function AppearanceSection() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const { preference, setPreference } = useLocalePreference();

  return (
    <>
      <SettingsBlock title={t('settings.appearance.theme.title')} description={t('settings.appearance.theme.description')}>
        <PillTabs
          variant="segmented"
          label={t('settings.appearance.theme.title')}
          value={theme}
          onChange={(id) => setTheme(id as Theme)}
          items={[
            { id: 'light', label: t('settings.appearance.theme.light'), icon: 'sun' },
            { id: 'dark', label: t('settings.appearance.theme.dark'), icon: 'moon' },
            { id: 'system', label: t('settings.appearance.theme.system'), icon: 'monitor' },
          ]}
        />
      </SettingsBlock>
      <SettingsBlock title={t('settings.appearance.language.title')} description={t('settings.appearance.language.description')}>
        <PillTabs
          variant="segmented"
          label={t('settings.appearance.language.title')}
          value={preference}
          onChange={(id) => setPreference(id as LocalePreference)}
          items={[
            { id: 'system', label: t('settings.appearance.language.system') },
            { id: 'it', label: t('settings.appearance.language.it') },
            { id: 'en', label: t('settings.appearance.language.en') },
          ]}
        />
      </SettingsBlock>
    </>
  );
}
