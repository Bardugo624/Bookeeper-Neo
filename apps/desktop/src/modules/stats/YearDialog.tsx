import { useEffect, useRef, useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useLocale, useT } from '../../app';
import { paintPoster } from './posterImage';
import { MAX_COVERS, readPosterTheme, type PosterData } from './posterModel';
import { monthName, busiestMonth, topGenre, type ReadingYear } from './readingModel';
import { useFinishedBooks } from './useReadingStats';
import { usePosterSave } from './usePosterSave';
import styles from './YearDialog.module.css';

/** "Il tuo anno in libri": preview of the 1080×1350 image and its "Save image" button. */
export function YearDialog({ year, open, onClose }: { year: ReadingYear; open: boolean; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  // State, not a plain ref: the canvas is mounted with the dialog, so the drawing must react to it.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  canvasRef.current = canvas;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Real covers would come from the Books module hooks; its `index.ts` exports none, so these are placeholders.
  const finished = useFinishedBooks(year.year, open);
  const { save, busy, error } = usePosterSave(year.year, () => canvasRef.current);

  const month = busiestMonth(year.by_month);
  const genre = topGenre(year.by_genre);
  const covers = finished.data;
  const labels = {
    heading: t('stats.poster.heading', { year: year.year }),
    books: t('stats.poster.books'),
    pages: t('stats.poster.pages'),
    busiestMonth: t('stats.poster.busiestMonth'),
    topGenre: t('stats.poster.topGenre'),
    covers: t('stats.poster.covers'),
  };
  const labelKey = JSON.stringify(labels);

  useEffect(() => {
    if (!open || !canvas) {
      setReady(false);
      return;
    }
    if (finished.isPending) return;
    const data: PosterData = {
      year: year.year,
      books: year.books,
      pages: year.pages,
      busiestMonth: month === null ? null : monthName(locale, month, 'long'),
      topGenre: genre,
      covers: (covers ?? []).slice(0, MAX_COVERS),
    };
    let live = true;
    setReady(false);
    setFailed(false);
    void paintPoster(canvas, data, labels, readPosterTheme()).then((ok) => {
      if (!live) return;
      setReady(ok);
      setFailed(!ok);
    });
    return () => {
      live = false;
    };
    // `labelKey` stands for `labels`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canvas, finished.isPending, covers, year, month, genre, locale, labelKey]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('stats.poster.title')}
      description={t('stats.poster.description')}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" disabled={!ready} loading={busy} loadingLabel={t('common.saving')} onClick={save}>
            {t('stats.poster.save')}
          </Button>
        </div>
      }
    >
      {failed || error ? (
        <p role="alert" className={styles.error}>
          {error ?? t('stats.poster.error')}
        </p>
      ) : null}
      <canvas ref={setCanvas} className={styles.canvas} role="img" aria-label={t('stats.poster.preview', { year: year.year })} />
    </Dialog>
  );
}
