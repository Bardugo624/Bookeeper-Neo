import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { usePlatform } from '../../platform';
import { useClient } from '../../session';
import { MAX_BOOKS, labelsFileName } from './labelsModel';

/** Asks the core for the PDF and hands it to the system "Save as" window. */
export function useLabelsPdf(bookIds: string[], onDone: () => void, open = true) {
  const t = useT();
  const client = useClient();
  const platform = usePlatform();
  const toast = useToast();
  const tooMany = bookIds.length > MAX_BOOKS;

  const run = useMutation({
    mutationFn: async () => {
      const { bytes, skipped } = await client.labelsPdf(bookIds);
      const name = labelsFileName(new Date());
      const out = await platform.saveFile({
        suggestedName: name,
        bytes,
        mime: 'application/pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      return { saved: out.saved, name, skipped };
    },
    onSuccess: (out) => {
      // Closing the "Save as" window is not an error: the dialog stays open.
      if (!out.saved) return;
      if (out.skipped > 0) {
        toast.show({ title: t('labels.toast.skipped', { count: out.skipped }), description: out.name, tone: 'warn' });
      } else {
        toast.show({ title: t('labels.toast.saved'), description: out.name, tone: 'ok' });
      }
      onDone();
    },
  });

  // Opening the dialog starts from a clean slate: no error from an earlier try.
  const { reset } = run;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const submit = () => {
    if (run.isPending || tooMany || bookIds.length === 0) return;
    run.mutate();
  };
  const problem = tooMany
    ? t('labels.tooMany', { max: MAX_BOOKS })
    : run.error
      ? apiErrorMessage(t, run.error)
      : null;
  return { submit, busy: run.isPending, problem, blocked: tooMany || bookIds.length === 0, reset: run.reset };
}
