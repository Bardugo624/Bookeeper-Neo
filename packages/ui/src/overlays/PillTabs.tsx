import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../base/Icon';
import { cx } from '../base/cx';
import styles from './PillTabs.module.css';
import { usePillIndicator } from './usePillIndicator';

export interface PillTabItem {
  id: string;
  label: string;
  icon?: IconName;
  /** A CSS color: draws a 9px dot before the label. */
  dot?: string;
  /** Show only the icon; the label stays as the accessible name. */
  iconOnly?: boolean;
}

export interface PillTabsProps {
  items: PillTabItem[];
  value: string;
  onChange: (id: string) => void;
  size?: 'md' | 'sm';
  variant?: 'pill' | 'segmented';
  /** Accessible name of the tab list. */
  label?: string;
}

export function PillTabs({ items, value, onChange, size = 'md', variant = 'pill', label }: PillTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const active = items.find((item) => item.id === value);
  const { box, ready } = usePillIndicator(listRef, active?.id);
  // With no matching value, the first tab stays reachable with the keyboard.
  const tabStopId = active?.id ?? items[0]?.id;

  const move = (event: KeyboardEvent, to: number) => {
    event.preventDefault();
    const next = items[(to + items.length) % items.length];
    if (!next) return;
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') move(event, index + 1);
    else if (event.key === 'ArrowLeft') move(event, index - 1);
    else if (event.key === 'Home') move(event, 0);
    else if (event.key === 'End') move(event, items.length - 1);
  };

  const indicatorStyle = box
    ? ({ '--pill-x': `${box.x}px`, '--pill-w': `${box.width}px` } as CSSProperties)
    : undefined;

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cx(styles.list, styles[variant], styles[size])}
    >
      <span
        aria-hidden="true"
        data-pill-indicator=""
        data-ready={ready || undefined}
        hidden={!box}
        className={styles.indicator}
        style={indicatorStyle}
      />
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          data-tab-id={item.id}
          aria-selected={item.id === value}
          aria-label={item.iconOnly ? item.label : undefined}
          tabIndex={item.id === tabStopId ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.dot ? <span aria-hidden="true" className={styles.dot} style={{ background: item.dot }} /> : null}
          {item.icon ? <Icon name={item.icon} size={size === 'sm' ? 14 : 16} /> : null}
          {item.iconOnly ? null : <span>{item.label}</span>}
        </button>
      ))}
    </div>
  );
}
