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
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align={align} side={side} sideOffset={6}>
          {items.map((entry) =>
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
