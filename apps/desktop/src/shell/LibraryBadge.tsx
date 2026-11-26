import { Menu, type MenuEntry } from '@bookeeper/ui/overlays';
import type { IconName } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { useSession } from '../session';
import { useTheme, type Theme } from '../theme';
import styles from './LibraryBadge.module.css';

const THEMES: Array<{ id: Theme; icon: IconName }> = [
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
  { id: 'system', icon: 'monitor' },
];

/** Library row at the foot of the sidebar; its menu holds the theme choice and sign-out. */
export function LibraryBadge() {
  const t = useT();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const { theme, setTheme } = useTheme();

  const library = me?.library.name ?? t('shell.library.unknown');
  // The avatar shows the person, as in the mockup; the library only stands in when unnamed.
  const initial = (me?.user.display_name?.trim() || library).charAt(0).toUpperCase();
  const subtitle = me ? `${me.user.display_name} · ${t(`shell.role.${me.user.role}`)}` : '';

  const entries: MenuEntry[] = [
    ...THEMES.map<MenuEntry>((o) => ({
      id: `theme-${o.id}`,
      label: t(`shell.theme.${o.id}`),
      icon: theme === o.id ? 'check' : o.icon,
      onSelect: () => setTheme(o.id),
    })),
    { type: 'separator', id: 'sep' },
    { id: 'sign-out', label: t('shell.signOut'), icon: 'logout', onSelect: () => void signOut() },
  ];

  return (
    <Menu
      side="top"
      align="start"
      items={entries}
      trigger={
        <button type="button" className={styles.badge}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <span className={styles.text}>
            <span className={styles.name} title={library}>
              {library}
            </span>
            <span className={styles.sub} title={subtitle}>
              {subtitle}
            </span>
          </span>
        </button>
      }
    />
  );
}
