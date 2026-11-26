import type { CSSProperties } from 'react';
import { useT } from '../../app';
import { TAG_COLORS, colorOf, type TagColor } from './tagModel';
import styles from './TagPickers.module.css';

export interface TagColorPickerProps {
  value: string;
  label: string;
  onChange(color: TagColor): void;
  disabled?: boolean;
}

/** The six colors as radio swatches with a name; the arrows move the choice. */
export function TagColorPicker({ value, label, onChange, disabled = false }: TagColorPickerProps) {
  const t = useT();
  const move = (i: number, step: number, group: HTMLElement | null) => {
    const next = TAG_COLORS[(i + step + TAG_COLORS.length) % TAG_COLORS.length]!;
    onChange(next);
    queueMicrotask(() => group?.querySelector<HTMLElement>(`[data-color="${next}"]`)?.focus());
  };
  return (
    <div role="radiogroup" aria-label={label} className={styles.swatches}>
      {TAG_COLORS.map((name, i) => (
        <button
          key={name}
          type="button"
          role="radio"
          data-color={name}
          disabled={disabled}
          aria-checked={name === value}
          aria-label={t(`tags.colors.${name}`)}
          tabIndex={name === value || (!TAG_COLORS.includes(value as TagColor) && i === 0) ? 0 : -1}
          className={styles.swatch}
          style={{ '--tag-color': colorOf(name) } as CSSProperties}
          onClick={() => onChange(name)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (step === 0) return;
            e.preventDefault();
            move(i, step, e.currentTarget.parentElement);
          }}
        />
      ))}
    </div>
  );
}
