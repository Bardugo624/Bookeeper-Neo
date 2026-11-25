import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportFormat, ImportReport } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { usePlatform } from '../../../../platform';
import { useClient } from '../../../../session';
import { IMPORT_LIMIT_BYTES, IMPORT_LIMIT_MB, errorsToCsv, readFileText } from './transferModel';

/** Choosing a file, sending it, and what comes back. Components never touch the client. */
export function useImport() {
  const t = useT();
  const client = useClient();
  const platform = usePlatform();
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImportFormat>('auto');
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const send = useMutation({
    mutationFn: async ({ source, as }: { source: File; as: ImportFormat }) => {
      const content = await readFileText(source);
      return client.importBooks({ format: as, content, dry_run: false });
    },
    onSuccess: (r) => {
      setReport(r);
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => setProblem(apiErrorMessage(t, e, { validation: t('transfer.import.errors.unknownFormat') })),
  });

  const choose = (picked: File | null) => {
    setReport(null);
    setProblem(null);
    if (picked && picked.size > IMPORT_LIMIT_BYTES) {
      setFile(null);
      setProblem(t('transfer.import.tooLarge', { size: IMPORT_LIMIT_MB }));
      return;
    }
    setFile(picked);
  };

  const submit = () => {
    if (!file || send.isPending) return;
    setProblem(null);
    setReport(null);
    send.mutate({ source: file, as: format });
  };

  const downloadErrors = async () => {
    if (!report) return;
    const bytes = new TextEncoder().encode(errorsToCsv(report.errors));
    try {
      const out = await platform.saveFile({
        suggestedName: 'bookeeper-import-errors.csv',
        bytes,
        mime: 'text/csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (out.saved) toast.show({ title: t('transfer.report.savedList'), tone: 'ok' });
    } catch (e) {
      setProblem(apiErrorMessage(t, e));
    }
  };

  return { file, format, setFormat, choose, submit, busy: send.isPending, problem, report, downloadErrors };
}
