import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { usePlatform } from '../../../../platform';
import { useClient } from '../../../../session';
import { useSettingsSession } from '../../useSettingsSession';
import { EXPORT_MIME, exportFileName, type ExportFormat } from './transferModel';

/** Fetches the export and hands it to the system "Save as" window. */
export function useExport() {
  const t = useT();
  const client = useClient();
  const platform = usePlatform();
  const toast = useToast();
  const { me, connection } = useSettingsSession();
  const [format, setFormat] = useState<ExportFormat>('json');
  const [problem, setProblem] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (as: ExportFormat) => {
      const { bytes } = await client.exportLibrary(as);
      const library = me?.library.name ?? connection?.library_name ?? t('transfer.export.unknownLibrary');
      const suggestedName = exportFileName(library, new Date(), as);
      const out = await platform.saveFile({
        suggestedName,
        bytes,
        mime: EXPORT_MIME[as],
        filters: [{ name: as.toUpperCase(), extensions: [as] }],
      });
      return { saved: out.saved, name: suggestedName };
    },
    onSuccess: (out) => {
      // Closing the window is not an error.
      if (out.saved) toast.show({ title: t('transfer.export.saved'), description: out.name, tone: 'ok' });
    },
    onError: (e) => setProblem(apiErrorMessage(t, e)),
  });

  const submit = () => {
    if (run.isPending) return;
    setProblem(null);
    run.mutate(format);
  };

  return { format, setFormat, submit, busy: run.isPending, problem };
}
