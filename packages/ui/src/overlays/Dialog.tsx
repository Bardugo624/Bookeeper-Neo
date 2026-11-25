import { useRef, type ReactNode } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { IconButton } from '../base/IconButton';
import { cx } from '../base/cx';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required: becomes the accessible name of the dialog. */
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action row at the bottom. */
  footer?: ReactNode;
  /** Accessible name of the close button (already translated by the caller). */
  closeLabel: string;
}

interface PanelProps extends DialogProps {
  panelClassName?: string;
}

/** Shared by Dialog and Drawer: overlay, panel, header, body and footer. */
export function DialogPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  panelClassName,
}: PanelProps) {
  // The dialog is controlled and has no Radix Trigger, so remember who had focus when it opened
  // (captured during render, before focus moves into the panel) and give focus back on close.
  const opener = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement;
  wasOpen.current = open;
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        {/* Without a description Radix would warn; opting out of aria-describedby is explicit. */}
        <RadixDialog.Content
          className={cx(styles.panel, panelClassName)}
          onCloseAutoFocus={restoreFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className={styles.header}>
            <div className={styles.heading}>
              <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className={styles.description}>{description}</RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close asChild>
              <IconButton icon="close" label={closeLabel} size="sm" />
            </RadixDialog.Close>
          </header>
          {children ? <div className={styles.body}>{children}</div> : null}
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Dialog(props: DialogProps) {
  return <DialogPanel {...props} panelClassName={styles.dialog} />;
}
