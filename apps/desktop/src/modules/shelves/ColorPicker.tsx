import { SHELF_COLORS } from '@bookeeper/ui/shelf';
import { useT } from '../../app';
import { COLOR_NAMES, type ColorName } from './model';
import styles from './ShelfFormDialog.module.css';

export interface ColorPickerProps {
  value: ColorName;
  onChange: (color: ColorName) => void;
}

/** The six cabinet colors as radio swatches with accessible names; arrows move the choice. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const t = useT();
  const move = (i: number, step: number) => {
    const next = COLOR_NAMES[(i + step + COLOR_NAMES.length) % COLOR_NAMES.length]!;
    onChange(next);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-color="${next}"]`)?.focus());
  };
  return (
    <div role="radiogroup" aria-label={t('shelves.form.color')} className={styles.swatches}>
      {COLOR_NAMES.map((name, i) => (
        <button
          key={name}
          type="button"
          role="radio"
          data-color={name}
          aria-checked={name === value}
          aria-label={t(`shelves.colors.${name}`)}
          tabIndex={name === value ? 0 : -1}
          className={styles.swatch}
          style={{ background: SHELF_COLORS[i] }}
          onClick={() => onChange(name)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(i, -1);
            }
          }}
        />
      ))}
    </div>
  );
}
