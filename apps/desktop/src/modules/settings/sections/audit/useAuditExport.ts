import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AuditOut } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { usePlatform } from '../../../../platform';
import { useClient } from '../../../../session';
import { auditCsv } from './auditCsv';
import { CSV_MAX, CSV_PAGE, queryParams, type AuditFilters } from './auditModel';
import { useDescribe } from './useDescribe';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Reads every page of the current results (up to 5,000 entries) and hands the CSV to "Save as". */
export function useAuditExport(filters: AuditFilters) {
  const t = useT();
  const client = useClient();
  const platform = usePlatform();
  const toast = useToast();
  const describe = useDescribe();
  const [problem, setProblem] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const params = queryParams(filters);
      const rows: AuditOut[] = [];
      let total = Infinity;
      while (rows.length < Math.min(total, CSV_MAX)) {
        const page = await client.listAudit({ ...params, limit: CSV_PAGE, offset: rows.length });
        total = page.total;
        if (page.items.length === 0) break;
        rows.push(...page.items);
      }
      const csv = auditCsv(
        (['id', 'at', 'person', 'device', 'action', 'what', 'entity_type', 'entity_id', 'detail'] as const).map((k) => t(`audit.csv.${k}`)),
        rows.slice(0, CSV_MAX).map((entry) => ({
          entry,
          at: new Date(entry.at * 1000).toISOString(),
          person: entry.user?.display_name ?? t('audit.system'),
          device: entry.device?.name ?? '',
          what: describe(entry),
        })),
      );
      const suggestedName = `${t('audit.csv.file')}-${localDay(new Date())}.csv`;
      const out = await platform.saveFile({
        suggestedName,
        bytes: new TextEncoder().encode(csv),
        mime: 'text/csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      return { saved: out.saved, name: suggestedName };
    },
    onSuccess: (out) => {
      if (out.saved) toast.show({ title: t('audit.export.saved'), description: out.name, tone: 'ok' });
    },
    onError: (e) => setProblem(apiErrorMessage(t, e)),
  });

  return {
    busy: run.isPending,
    problem,
    submit: () => {
      if (run.isPending) return;
      setProblem(null);
      run.mutate();
    },
  };
}
