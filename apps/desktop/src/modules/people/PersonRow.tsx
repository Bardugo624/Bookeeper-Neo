import { IconButton, Tag, type IconName } from '@bookeeper/ui/base';
import { Menu, type MenuEntry } from '@bookeeper/ui/overlays';
import type { PersonOut } from '@bookeeper/api';
import { useLocale, useT } from '../../app';
import { formatRelativeDays } from '../../kit';
import type { PersonAction } from './model';
import styles from './PersonRow.module.css';

export interface PersonRowProps {
  person: PersonOut;
  actions: PersonAction[];
  onAction(action: PersonAction): void;
}

const MENU: Record<PersonAction, { label: string; icon: IconName; danger?: boolean }> = {
  role: { label: 'people.menu.role', icon: 'settings' },
  rename: { label: 'people.menu.rename', icon: 'pencil' },
  owner: { label: 'people.menu.owner', icon: 'check' },
  remove: { label: 'people.menu.remove', icon: 'trash', danger: true },
  leave: { label: 'people.menu.leave', icon: 'logout', danger: true },
};

export function PersonRow({ person, actions, onAction }: PersonRowProps) {
  const t = useT();
  const locale = useLocale();
  const seen = person.last_seen != null ? t('people.lastSeen', { when: formatRelativeDays(locale, person.last_seen) }) : t('people.neverSeen');
  const items: MenuEntry[] = actions.map((a) => ({
    id: a,
    label: t(MENU[a].label),
    icon: MENU[a].icon,
    danger: MENU[a].danger,
    onSelect: () => onAction(a),
  }));

  return (
    <li className={styles.row}>
      <div className={styles.body}>
        <div className={styles.top}>
          <h3 className={styles.name}>{person.display_name}</h3>
          {person.is_me ? <Tag tone="primary">{t('people.you')}</Tag> : null}
          <Tag tone={person.role === 'owner' ? 'ok' : 'neutral'}>{t(`people.roles.${person.role}`)}</Tag>
        </div>
        <p className={styles.meta}>
          {person.email ? <span>{person.email}</span> : null}
          <span>{t('people.devices', { count: person.devices })}</span>
          <span>{seen}</span>
        </p>
      </div>
      {items.length > 0 ? (
        <Menu trigger={<IconButton icon="more" size="sm" label={t('people.menu.open', { name: person.display_name })} />} items={items} />
      ) : null}
    </li>
  );
}
