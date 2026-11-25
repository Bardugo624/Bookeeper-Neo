import { useEffect, useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { formatCountdown, groupCode } from './model';
import styles from './CodeBlock.module.css';

const COPIED_MS = 2000;

export interface CodeBlockProps {
  code: string;
  /** Whole seconds left; 0 when expired. */
  remaining: number;
  onRegenerate(): void;
  regenerating: boolean;
}

/** The code in large fixed-pitch characters, with Copy, the countdown and, once expired, a way to renew it. */
export function CodeBlock({ code, remaining, onRegenerate, regenerating }: CodeBlockProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const expired = remaining <= 0;

  // A new code starts un-copied, and the confirmation fades on its own.
  useEffect(() => setCopied(false), [code]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.block}>
      <p className={`${styles.code} ${expired ? styles.expired : ''}`} aria-label={t('devices.pair.codeLabel', { code: code.split('').join(' ') })}>
        <span aria-hidden="true">{groupCode(code)}</span>
      </p>
      {expired ? (
        <div className={styles.row} role="status">
          <span>{t('devices.pair.expired')}</span>
          <Button variant="primary" size="sm" icon="plus" loading={regenerating} loadingLabel={t('devices.pair.generating')} onClick={onRegenerate}>
            {t('devices.pair.regenerate')}
          </Button>
        </div>
      ) : (
        <div className={styles.row}>
          <span>{t('devices.pair.expiresIn', { time: formatCountdown(remaining) })}</span>
          <Button variant="secondary" size="sm" icon={copied ? 'check' : 'link'} onClick={() => void copy()}>
            {copied ? t('devices.pair.copied') : t('devices.pair.copy')}
          </Button>
        </div>
      )}
    </div>
  );
}
