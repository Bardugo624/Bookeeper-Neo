import { Button } from '@bookeeper/ui/base';
import { useT } from '../shell';
import { Notice } from './Notice';

/** Bookeeper is open: ask to close it, then try again. */
export function AppRunning({ onRetry }: { onRetry(): void }) {
  const t = useT();
  return (
    <Notice badge={{ icon: 'alert', tone: 'warn' }} title={t('setup.running.title')} text={t('setup.running.text')}>
      <Button variant="primary" onClick={onRetry}>
        {t('setup.running.retry')}
      </Button>
    </Notice>
  );
}

export interface FailedProps {
  copied: boolean;
  onCopy(): void;
  onRetry(): void;
}

/** The operation stopped: copy the log's tail for whoever helps, or try again. */
export function Failed({ copied, onCopy, onRetry }: FailedProps) {
  const t = useT();
  return (
    <Notice badge={{ icon: 'alert', tone: 'warn' }} title={t('setup.error.install')} text={t('setup.error.text')}>
      <Button variant="ghost" icon={copied ? 'check' : undefined} onClick={onCopy} aria-live="polite">
        {t(copied ? 'setup.error.copied' : 'setup.error.copy')}
      </Button>
      <Button variant="primary" onClick={onRetry}>
        {t('setup.error.retry')}
      </Button>
    </Notice>
  );
}
