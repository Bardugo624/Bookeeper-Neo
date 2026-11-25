import { useEffect, useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';

/** "Copia" for one value; the label turns to "Copiato" for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button variant="secondary" size="sm" icon={copied ? 'check' : 'link'} aria-label={label} onClick={() => void copy()}>
      {copied ? t('sharing.copied') : t('sharing.copy')}
    </Button>
  );
}
