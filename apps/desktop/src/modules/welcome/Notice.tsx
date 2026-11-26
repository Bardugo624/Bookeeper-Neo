import { Button, Icon } from '@bookeeper/ui/base';
import styles from './form.module.css';

export interface NoticeProps {
  text: string;
  /** A button that sends the user to another card. */
  action?: { label: string; onClick: () => void };
}

/** A message above the button of a form. */
export function Notice({ text, action }: NoticeProps) {
  return (
    <div role="alert" className={styles.notice}>
      <p className={styles.noticeText}>
        <Icon name="alert" size={15} />
        <span>{text}</span>
      </p>
      {action ? (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
