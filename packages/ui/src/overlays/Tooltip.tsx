import type { ReactElement, ReactNode } from 'react';
import { Tooltip as RadixTooltip } from 'radix-ui';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  /** Text or a node, e.g. a bold title plus a secondary line. */
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** The element that triggers the tooltip; it must accept a ref and focus. */
  children: ReactElement;
}

export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className={styles.content} side={side} sideOffset={8}>
            {content}
            <RadixTooltip.Arrow className={styles.arrow} width={12} height={6} />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
