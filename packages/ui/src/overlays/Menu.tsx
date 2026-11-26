import type { ReactElement } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Icon, type IconName } from '../base/Icon';
import { cx } from '../base/cx';
import styles from './Menu.module.css';

export type MenuEntry =
  | { type: 'separator'; id: string }
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: IconName;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

export interface MenuProps {
  /** The element that opens the menu; it must be a single focusable element. */
  trigger: ReactElement;
  items: MenuEntry[];
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Menu({ trigger, items, align = 'end', side = 'bottom' }: MenuProps) {
  const isDanger = (e: MenuEntry) => e.type !== 'separator' && e.danger === true;
  // Separators between regular entries collapse to one; none lead or trail.
  const regular: MenuEntry[] = [];
  for (const e of items.filter((x) => !isDanger(x))) {
    if (e.type === 'separator' && (regular.length === 0 || regular[regular.length - 1].type === 'separator')) continue;
    regular.push(e);
  }
  while (regular.length > 0 && regular[regular.length - 1].type === 'separator') regular.pop();
  const dangerous = items.filter(isDanger);
  // Dangerous entries always sit last, after a divider (only when something precedes them), in arrival order.
  const ordered: MenuEntry[] =
    dangerous.length === 0
      ? regular
      : [...regular, ...(regular.length > 0 ? [{ type: 'separator', id: '__danger-separator' } as const] : []), ...dangerous];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align={align} side={side} sideOffset={6}>
          {ordered.map((entry) =>
            entry.type === 'separator' ? (
              <DropdownMenu.Separator key={entry.id} className={styles.separator} />
            ) : (
              <DropdownMenu.Item
                key={entry.id}
                className={cx(styles.item, entry.danger && styles.danger)}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
              >
                {entry.icon ? <Icon name={entry.icon} size={15} /> : null}
                <span>{entry.label}</span>
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
