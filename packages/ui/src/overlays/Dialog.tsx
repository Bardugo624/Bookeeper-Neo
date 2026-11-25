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

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Where focus may go back to, best first: the element focused at open time; the trigger of the menu
 * it lives in (a menu item is removed when the menu closes); the focusable elements that preceded it,
 * nearest first; finally the first focusable element of the page.
 */
function focusCandidates(): Element[] {
  const list: Element[] = [];
  const active = document.activeElement;
  if (active && active !== document.body) {
    list.push(active);
    const menuId = active.closest('[role="menu"]')?.getAttribute('aria-labelledby');
    const menuTrigger = menuId ? document.getElementById(menuId) : null;
    if (menuTrigger) list.push(menuTrigger);
    const all = Array.from(document.querySelectorAll(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));
    const at = all.indexOf(active);
    if (at > 0) list.push(...all.slice(0, at).reverse());
  }
  const first = document.querySelector(FOCUSABLE);
  if (first) list.push(first);
  return list;
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
  const candidates = useRef<Element[]>([]);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) candidates.current = focusCandidates();
  wasOpen.current = open;
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    // First candidate still in the document; never leave focus on <body>.
    const target = candidates.current.find((el) => el.isConnected && el instanceof HTMLElement);
    (target as HTMLElement | undefined)?.focus();
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
