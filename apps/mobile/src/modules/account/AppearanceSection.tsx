import { useLocalePreference, useT, type LocalePreference } from '../../app/i18n';
import { useThemePreference, type ThemePreference } from '../../app/theme';
import { Choice } from './Choice';
import styles from './Account.module.css';

/** Theme and language. Both preferences live in the app foundations; this only edits them. */
export function AppearanceSection() {
  const t = useT();
  const theme = useThemePreference();
  const locale = useLocalePreference();
  return (
    <section className={styles.card} aria-labelledby="account-look">
      <h2 id="account-look" className={styles.heading}>
        {t('maccount.look.title')}
      </h2>
      <Choice<ThemePreference>
        label={t('maccount.look.theme')}
        value={theme.value}
        onChange={theme.set}
        options={[
          { value: 'system', label: t('maccount.look.system') },
          { value: 'light', label: t('maccount.look.light') },
          { value: 'dark', label: t('maccount.look.dark') },
        ]}
      />
      <Choice<LocalePreference>
        label={t('maccount.look.language')}
        value={locale.value}
        onChange={locale.set}
        options={[
          { value: 'system', label: t('maccount.look.system') },
          { value: 'it', label: t('maccount.look.it') },
          { value: 'en', label: t('maccount.look.en') },
        ]}
      />
    </section>
  );
}
