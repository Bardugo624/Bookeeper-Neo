import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportFormat, ImportReport } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { usePlatform } from '../../../../platform';
import { useClient } from '../../../../session';
import { IMPORT_LIMIT_BYTES, IMPORT_LIMIT_MB, errorsToCsv, importBodyBytes, readFileText } from './transferModel';

/** Choosing a file, sending it, and what comes back. Components never touch the client. */
export function useImport() {
  const t = useT();
  const client = useClient();
  const platform = usePlatform();
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [format, setFormat] = useState<ImportFormat>('auto');
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  // Only the latest choice may fill in the text, however late an older read ends.
  const choice = useRef(0);

  const send = useMutation({
    mutationFn: ({ text, as }: { text: string; as: ImportFormat }) =>
      client.importBooks({ format: as, content: text, dry_run: false }),
    onSuccess: (r) => {
      setReport(r);
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => setProblem(apiErrorMessage(t, e, { validation: t('transfer.import.errors.unknownFormat') })),
  });

  const tooLarge = () => t('transfer.import.tooLarge', { size: IMPORT_LIMIT_MB });

  /** The server's limit is on the JSON body, which is larger than the file: measure that. */
  const fits = (text: string, as: ImportFormat) => importBodyBytes(as, text) <= IMPORT_LIMIT_BYTES;

  const choose = (picked: File | null) => {
    const mine = ++choice.current;
    setReport(null);
    setProblem(null);
    setFile(null);
    setContent(null);
    if (!picked) return;
    // The body is never smaller than the file, so a file over the limit need not be read.
    if (picked.size > IMPORT_LIMIT_BYTES) {
      setProblem(tooLarge());
      return;
    }
    readFileText(picked).then(
      (text) => {
        if (mine !== choice.current) return;
        if (!fits(text, format)) {
          setProblem(tooLarge());
          return;
        }
        setFile(picked);
        setContent(text);
      },
      () => {
        if (mine === choice.current) setProblem(t('transfer.import.unreadable'));
      },
    );
  };

  const submit = () => {
    if (!file || content === null || send.isPending) return;
    setReport(null);
    if (!fits(content, format)) {
      setProblem(tooLarge());
      return;
    }
    setProblem(null);
    send.mutate({ text: content, as: format });
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
