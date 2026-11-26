import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { useBorrowerSuggestions } from './useBorrowerSuggestions';
import styles from './BorrowerInput.module.css';

export interface BorrowerInputProps {
  value: string;
  onChange(name: string): void;
}

/** Name field that suggests the names already used (combobox); a new name can always be typed. */
export function BorrowerInput({ value, onChange }: BorrowerInputProps) {
  const t = useT();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const names = useBorrowerSuggestions(value, focused);
  const open = focused && !dismissed && names.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  const pick = (name: string) => {
    onChange(name);
    setDismissed(true);
    setActive(-1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (names.length === 0) return;
      e.preventDefault();
      setDismissed(false);
      const down = e.key === 'ArrowDown';
      setActive((i) => (down ? (i + 1) % names.length : i <= 0 ? names.length - 1 : i - 1));
    } else if (e.key === 'Enter' && open && active >= 0 && names[active] !== undefined) {
      e.preventDefault();
      pick(names[active]!);
    }
  };
  // The dialog closes on Escape from a capture listener on the document; a window capture one runs first.
  useEffect(() => {
    if (!open) return;
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setDismissed(true);
      setActive(-1);
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [open]);

  return (
    <div className={styles.wrap}>
      <Input
        name="borrower_name"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(-1);
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" aria-label={t('loans.form.borrowerSuggestions')} className={styles.list}>
          {names.map((name, i) => (
            <li
              key={name}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              data-active={i === active || undefined}
              // mousedown, not click: the input must not lose focus before the choice lands.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(name);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
