import { useCallback } from 'react';
import type { AuditOut } from '@bookeeper/api';
import { useT } from '../../../../app/i18n';
import { phraseOf } from './auditModel';

/** The readable sentence for an entry; a book title the caller found replaces the stored one. */
export function useDescribe() {
  const t = useT();
  return useCallback(
    (e: AuditOut, title?: string): string => {
      const p = phraseOf(e);
      if (p.key === null) return e.action;
      const vars: Record<string, string | number> = { ...p.vars, title: title ?? p.title ?? t('audit.unknownBook') };
      if (typeof vars.status === 'string' && vars.status) vars.status = t(`audit.readingStatus.${vars.status}`);
      // The automatic backup has no person behind it.
      if (e.action === 'library.backup' && (e.detail as { automatic?: boolean } | null)?.automatic) return t('audit.what.library.backupAuto');
      return t(p.key, vars);
    },
    [t],
  );
}
