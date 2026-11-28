import { Button, Icon } from '@bookeeper/ui/base';
import type { ReactNode } from 'react';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import styles from './InstallSheet.module.css';

/** Renders `**bold**` runs and `{name}` icon slots of a step. */
function rich(text: string, icons: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\} \*\*[^*]+\*\*|\*\*[^*]+\*\*|\{\w+\})/).map((part, i) => {
    const pair = /^\{(\w+)\} \*\*([^*]+)\*\*$/.exec(part);
    if (pair && pair[1]! in icons) {
      return (
        <span key={i} className={styles.pair}>
          <span className={styles.icon}>{icons[pair[1]!]}</span> <strong>{pair[2]}</strong>
        </span>
      );
    }
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const slot = /^\{(\w+)\}$/.exec(part)?.[1];
    if (slot && slot in icons) return <span key={i} className={styles.icon}>{icons[slot]}</span>;
    return part;
  });
}

/** On an iPhone in Safari: why the books need the Home Screen, and how to get there. */
export function InstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const icons = { share: <Icon name="share" size={18} />, plus: <Icon name="square-plus" size={18} /> };
  const steps = ['one', 'two', 'three'] as const;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('mreader.offline.install.title')}
      footer={
        <Button variant="primary" className={styles.done} onClick={() => onOpenChange(false)}>
          {t('mreader.offline.install.done')}
        </Button>
      }
    >
      <p className={styles.why}>{t('mreader.offline.install.why')}</p>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step}>
            <span>{rich(t(`mreader.offline.install.${step}`), icons)}</span>
          </li>
        ))}
      </ol>
      <p className={styles.online}>{t('mreader.offline.install.online')}</p>
    </BottomSheet>
  );
}
