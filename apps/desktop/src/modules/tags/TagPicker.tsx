import { useEffect, useId, type FocusEvent } from 'react';
import { Icon, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { TagColorPicker } from './TagColorPicker';
import { TagChip } from './TagChips';
import { MAX_TAGS_PER_BOOK } from './tagModel';
import { useTagPicker, type PickerOption } from './useTagPicker';
import styles from './TagPickers.module.css';

export interface TagPickerProps {
  /** Ids of the chosen tags. */
  value: string[];
  onChange(next: string[]): void;
  disabled?: boolean;
}

/** Multiple-choice combobox with search; "Create «text»" adds a tag that does not exist yet. */
export function TagPicker({ value, onChange, disabled = false }: TagPickerProps) {
  const t = useT();
  const id = useId();
  const picker = useTagPicker(value, onChange);
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const showList = picker.open && !disabled;
  const creating = picker.options.find((o) => o.kind === 'create');

  const setOpen = picker.setOpen;
  // The dialog closes on Escape from a capture listener on the document; a window capture one runs first.
  useEffect(() => {
    if (!showList) return;
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [showList, setOpen]);

  const leave = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    // Close once the focus has landed: removing the list while the focus is between two
    // elements makes a modal dialog's focus trap pull the focus back to the dialog itself.
    window.setTimeout(() => setOpen(false), 0);
  };

  return (
    <div className={styles.picker} onBlur={leave}>
      <label htmlFor={`${id}-input`} className={styles.label}>
        {t('tags.picker.label')}
      </label>
      {picker.selected.length > 0 ? (
        <ul className={styles.chosen} aria-label={t('tags.picker.chosen')}>
          {picker.selected.map((tag) => (
            <li key={tag.id} className={styles.chosenItem}>
              <TagChip tag={tag} />
              <button
                type="button"
                className={styles.remove}
                disabled={disabled}
                aria-label={t('tags.picker.remove', { name: tag.name })}
                onClick={() => picker.toggle(tag.id)}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={`${id}-input`}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && picker.options.length > 0 ? optionId(picker.active) : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={t('tags.picker.placeholder')}
        value={picker.text}
        onChange={(e) => picker.edit(e.target.value)}
        onFocus={() => picker.setOpen(true)}
        onClick={() => picker.setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' && picker.onKeyDown(e.key)) e.preventDefault();
        }}
      />
      <p className={styles.hint} role={picker.full ? 'status' : undefined}>
        {picker.full ? t('tags.picker.limit', { max: MAX_TAGS_PER_BOOK }) : t('tags.picker.count', { count: value.length, max: MAX_TAGS_PER_BOOK })}
      </p>
      {picker.error ? (
        <p role="alert" className={styles.error}>
          {picker.error}
        </p>
      ) : null}
      {showList ? (
        <>
          <ul id={listId} role="listbox" aria-multiselectable="true" aria-label={t('tags.picker.options')} className={styles.list}>
            {picker.options.map((option, i) => (
              <li
                key={option.kind === 'tag' ? option.tag.id : 'create'}
                id={optionId(i)}
                role="option"
                aria-selected={option.kind === 'tag' ? option.selected : false}
                aria-disabled={option.disabled || undefined}
                className={i === picker.active ? `${styles.option} ${styles.activeOption}` : styles.option}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => picker.setActive(i)}
                onClick={() => picker.choose(option)}
              >
                <Option option={option} />
              </li>
            ))}
            {picker.options.length === 0 ? (
              <li role="presentation" className={styles.empty}>
                {picker.loading ? t('tags.picker.loading') : picker.failed ? t('tags.picker.failed') : t('tags.picker.none')}
              </li>
            ) : null}
          </ul>
          {creating ? (
            <div className={styles.newColor} onMouseDown={(e) => e.preventDefault()}>
              <span className={styles.label}>{t('tags.picker.newColor')}</span>
              <TagColorPicker value={picker.color} label={t('tags.picker.newColor')} onChange={picker.setColor} disabled={picker.creating} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Option({ option }: { option: PickerOption }) {
  const t = useT();
  if (option.kind === 'create') return <span>{t('tags.picker.create', { name: option.name })}</span>;
  return (
    <>
      <TagChip tag={option.tag} />
      {option.selected ? <Icon name="check" size={14} /> : null}
    </>
  );
}
