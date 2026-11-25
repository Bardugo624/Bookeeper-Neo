import { useId, useRef, useState, type DragEvent } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { cx } from './cx';
import styles from './FilePicker.module.css';

export interface FilePickerProps {
  /** Text of the button (already translated). */
  label: string;
  /** Accessible name of the native input; the button text when absent. */
  inputLabel?: string;
  /** Value of the `accept` attribute of the native input. */
  accept?: string;
  /** Name of the file chosen so far; "no file chosen" is shown when absent. */
  fileName?: string | null;
  disabled?: boolean;
  /** Accept a file dropped on the control. */
  droppable?: boolean;
  /** Replaces the file name while a file is dragged over the control (translated). */
  draggingLabel?: string;
  size?: 'md' | 'sm';
  onPick(file: File | null): void;
}

/**
 * A secondary button with the name of the chosen file beside it. The native input is
 * visually hidden but stays in the tab order, so the keyboard reaches it and a screen reader
 * names it; the button is only the mouse's way to it.
 */
export function FilePicker({
  label,
  inputLabel,
  accept,
  fileName,
  disabled = false,
  droppable = false,
  draggingLabel,
  size = 'md',
  onPick,
}: FilePickerProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onPick(file);
  };
  const dropProps = droppable
    ? {
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: drop,
      }
    : {};

  return (
    <div className={cx(styles.root, over && styles.dragging)} {...dropProps}>
      <input
        ref={input}
        type="file"
        className={styles.input}
        accept={accept}
        disabled={disabled}
        aria-label={inputLabel ?? label}
        aria-describedby={nameId}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          // Lets the same file be chosen again after a change of mind.
          e.target.value = '';
        }}
      />
      <Button
        variant="secondary"
        size={size}
        className={styles.button}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
      <span id={nameId} className={cx(styles.name, !fileName && styles.empty)}>
        {over && draggingLabel ? draggingLabel : (fileName ?? t('common.file.none'))}
      </span>
    </div>
  );
}
