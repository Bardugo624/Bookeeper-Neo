import { useId } from 'react';
import { useT } from '../../app';
import styles from './FiltersDrawer.module.css';

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface FacetSelectProps {
  label: string;
  value: string | null;
  options: FacetOption[];
  /** Text of the "no filter" choice. */
  anyLabel: string;
  onChange(value: string | null): void;
  disabled?: boolean;
}

/** A native select of facet values, each with its count. A value that is not in the list is kept visible. */
export function FacetSelect({ label, value, options, anyLabel, onChange, disabled }: FacetSelectProps) {
  const t = useT();
  const id = useId();
  const shown = value !== null && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select id={id} className={styles.select} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{anyLabel}</option>
        {shown.map((o) => (
          <option key={o.value} value={o.value}>
            {o.count === undefined ? o.label : t('books.panel.withCount', { name: o.label, count: o.count })}
          </option>
        ))}
      </select>
    </div>
  );
}
