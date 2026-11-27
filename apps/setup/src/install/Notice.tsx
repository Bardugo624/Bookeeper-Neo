import type { ReactNode } from 'react';
import { Icon, type IconName } from '@bookeeper/ui/base';
import { PanelTitle } from './PanelTitle';
import styles from './panel.module.css';

export interface NoticeProps {
  title: string;
  text: string;
  /** A round badge before the title; without it the text starts at the margin. */
  badge?: { icon: IconName; tone: 'ok' | 'warn' };
  /** The commands, on the right. */
  children: ReactNode;
}

/** A title, a sentence and the commands: the shape of «Fatto», «Chiudi Bookeeper», the error and the maintenance panels. */
export function Notice({ title, text, badge, children }: NoticeProps) {
  return (
    <div className={styles.row}>
      <div className={styles.lead}>
        {badge ? (
          <span className={styles.badge} data-tone={badge.tone}>
            <Icon name={badge.icon} size={17} />
          </span>
        ) : null}
        <div>
          <PanelTitle>{title}</PanelTitle>
          <p className={styles.text}>{text}</p>
        </div>
      </div>
      <div className={styles.acts}>{children}</div>
    </div>
  );
}
