import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { PersonIcon } from './PersonIcon';
import { useBorrowerSuggestions } from './useBorrowerSuggestions';
import styles from './BorrowerInput.module.css';

export interface BorrowerInputProps {
  value: string;
  /** Whether the text stands for a person of the library (set by choosing one, cleared by typing). */
  personId?: string | null;
  onChange(name: string, personId: string | null): void;
}

interface Option {
  key: string;
  label: string;
  personId: string | null;
}

/** Name field that suggests the people of the library, then the names already used; a free name can always be typed. */
export function BorrowerInput({ value, personId = null, onChange }: BorrowerInputProps) {
  const t = useT();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const me = t('loans.form.me');
  const { people, names: used } = useBorrowerSuggestions(value, focused, me);
  const options: Option[] = [
    ...people.map((p) => ({ key: `p:${p.id}`, label: p.is_me ? me : p.display_name, personId: p.id })),
    ...used.map((n) => ({ key: `n:${n}`, label: n, personId: null })),
  ];
  const open = focused && !dismissed && options.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  const pick = (o: Option) => {
    onChange(o.label, o.personId);
    setDismissed(true);
    setActive(-1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      setDismissed(false);
      const down = e.key === 'ArrowDown';
      setActive((i) => (down ? (i + 1) % options.length : i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && open && active >= 0 && options[active] !== undefined) {
      e.preventDefault();
      pick(options[active]!);
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
        data-person={personId ?? undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          onChange(e.target.value, null);
          setDismissed(false);
          setActive(-1);
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" aria-label={t('loans.form.borrowerSuggestions')} className={styles.list}>
          {options.map((o, i) => (
            <li
              key={o.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              data-active={i === active || undefined}
              // mousedown, not click: the input must not lose focus before the choice lands.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              {o.personId ? <PersonIcon /> : null}
              {o.personId ? ' ' : null}
              {o.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
