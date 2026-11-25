import styles from './SelectionCheckbox.module.css';

export interface SelectionCheckboxProps {
  label: string;
  checked: boolean;
  /** `range` is true when Shift was held. */
  onToggle(range: boolean): void;
  className?: string;
}

export function SelectionCheckbox({ label, checked, onToggle, className }: SelectionCheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      className={[styles.box, className].filter(Boolean).join(' ')}
      // The toggle runs on click, where the Shift key is known; `onChange` only keeps React quiet.
      onChange={() => {}}
      onClick={(e) => onToggle(e.shiftKey)}
    />
  );
}
