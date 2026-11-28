import type { ReactElement, ReactNode } from 'react';
import { Popover as RadixPopover } from 'radix-ui';
import styles from './Popover.module.css';

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that anchors the popover; it must be a single focusable element. Clicking it toggles. */
  trigger: ReactElement;
  /** Names the popover for assistive technology. */
  label: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

/** A small non-modal window anchored to its trigger: no veil, the page stays live. Esc, an outside click or the trigger close it. */
export function Popover({ open, onOpenChange, trigger, label, children, side = 'bottom', align = 'end' }: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className={styles.content} side={side} align={align} sideOffset={8} collisionPadding={8} aria-label={label}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
