import { useCallback } from 'react';
import type { AuditOut } from '@bookeeper/api';
import { useT } from '../../../../app/i18n';
import { phraseOf } from './auditModel';

const TITLED = new Set([
  'book.create', 'book.update', 'book.cover', 'book.cover_delete', 'book.tags',
  'reading.set', 'reading.delete', 'shelf.place', 'shelf.unplace', 'wishlist.create', 'wishlist.convert',
]);

/** The readable sentence for an entry; a book title the caller found replaces the stored one. */
export function useDescribe() {
  const t = useT();
  return useCallback(
    (e: AuditOut, title?: string, gone = false): string => {
      const p = phraseOf(e);
      if (p.key === null) return e.action;
      const known = title ?? p.title;
      const vars: Record<string, string | number> = { ...p.vars, title: known ?? '' };
      if (typeof vars.status === 'string' && vars.status) vars.status = t(`audit.readingStatus.${vars.status}`);
      if (typeof vars.role === 'string' && vars.role) vars.role = t(`audit.roles.${vars.role}`);
      // The automatic backup has no person behind it.
      if (e.action === 'library.backup' && (e.detail as { automatic?: boolean } | null)?.automatic) return t('audit.what.library.backupAuto');
      // No title to show: a sentence without one while the book loads, a dedicated one when it is gone.
      if (known === undefined && TITLED.has(e.action)) return t(p.key.replace('audit.what.', gone ? 'audit.whatGone.' : 'audit.whatUntitled.'), vars);
      return t(p.key, vars);
    },
    [t],
  );
}
