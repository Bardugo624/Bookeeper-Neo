import { useMutation } from '@tanstack/react-query';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { usePlatform } from '../../platform';
import { canvasPng } from './posterImage';
import { posterFileName } from './posterModel';

/** Hands the PNG of the poster canvas to the system "Save as" window. */
export function usePosterSave(year: number, getCanvas: () => HTMLCanvasElement | null) {
  const t = useT();
  const platform = usePlatform();
  const toast = useToast();
  const run = useMutation({
    mutationFn: async () => {
      const canvas = getCanvas();
      if (!canvas) throw new Error('no canvas');
      const name = posterFileName(year);
      const out = await platform.saveFile({
        suggestedName: name,
        bytes: canvasPng(canvas),
        mime: 'image/png',
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      return { saved: out.saved, name };
    },
    onSuccess: (out) => {
      if (out.saved) toast.show({ title: t('stats.poster.saved'), description: out.name, tone: 'ok' });
    },
  });
  return { save: () => run.mutate(), busy: run.isPending, error: run.error ? apiErrorMessage(t, run.error) : null };
}
