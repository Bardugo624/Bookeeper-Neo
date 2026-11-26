import styles from './RadioGroup.module.css';

export interface RadioGroupProps<V extends string | number> {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange(value: V): void;
}

/** A labelled set of native radio buttons: arrow keys, grouping and names come from the browser. */
export function RadioGroup<V extends string | number>({ legend, name, options, value, onChange }: RadioGroupProps<V>) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={styles.option}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
