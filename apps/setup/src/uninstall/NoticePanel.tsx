import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@bookeeper/ui/base';
import styles from './NoticePanel.module.css';

export interface NoticePanelProps {
  title: string;
  text?: string;
  /** Amber badge with the alert icon; the closing panel has none. */
  alert?: boolean;
  children: ReactNode;
}

/** A 180px panel: title and sentence on the left, the commands on the right. Focus lands on the title. */
export function NoticePanel({ title, text, alert = false, children }: NoticePanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <div className={styles.panel}>
      <div className={styles.lead}>
        {alert ? (
          <span className={styles.badge}>
            <Icon name="alert" size={17} />
          </span>
        ) : null}
        <div>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          {text ? <p className={styles.text}>{text}</p> : null}
        </div>
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}
