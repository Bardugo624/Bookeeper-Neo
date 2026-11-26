import { useState } from 'react';
import { useT } from '../../app/i18n';
import { BottomSheet, apiErrorMessage, cx } from '../../kit';
import { useDraftCount, useFacets, useRooms } from './useFilterData';
import { NO_SHEET_FILTERS, READING_FILTERS, type ReadingFilter, type SearchState, type SheetFilters } from './searchState';
import styles from './FilterSheet.module.css';

export interface FilterSheetProps {
  /** The list as it is now: the sheet starts from its filters and counts books against its text and quick filter. */
  applied: SearchState;
  onApply: (next: SheetFilters) => void;
  onClose: () => void;
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className={styles.sectionError}>
      <p role="alert">{message}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('msearch.sheet.retry')}
      </button>
    </div>
  );
}

/** Reading state, tags and room in a bottom sheet; nothing changes the list until "Show N books". */
export function FilterSheet({ applied, onApply, onClose }: FilterSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState<SheetFilters>({ reading: applied.reading, tags: applied.tags, room: applied.room });
  const facetsQ = useFacets();
  const roomsQ = useRooms();
  const facets = facetsQ.data;
  const rooms = roomsQ.data ?? [];
  const count = useDraftCount({ ...applied, ...draft }, true);
  const tags = facets?.tags ?? [];
  const toggleTag = (id: string) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(id) ? d.tags.filter((x) => x !== id) : [...d.tags, id] }));
  const pick = <K extends 'reading' | 'room'>(key: K, value: SheetFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: d[key] === value ? null : value }));

  return (
    <BottomSheet
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('msearch.sheet.title')}
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.reset} onClick={() => setDraft(NO_SHEET_FILTERS)}>
            {t('msearch.sheet.reset')}
          </button>
          <button type="button" className={styles.apply} onClick={() => onApply(draft)}>
            {count === undefined ? t('msearch.sheet.show') : t('msearch.sheet.showCount', { count })}
          </button>
        </div>
      }
    >
      <div className={styles.sheet}>
        <section aria-labelledby="msf-reading">
            <h3 id="msf-reading" className={styles.heading}>{t('msearch.sheet.reading')}</h3>
            <ul className={styles.choices}>
              {READING_FILTERS.map((id: ReadingFilter) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={draft.reading === id}
                    className={cx(styles.choice, draft.reading === id && styles.on)}
                    onClick={() => pick('reading', id)}
                  >
                    {t(`msearch.reading.${id}`)} {facets?.reading[id] !== undefined ? <span className={styles.n}>{facets.reading[id]}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
        </section>
        {tags.length > 0 || facetsQ.isError ? (
          <section aria-labelledby="msf-tags">
            <h3 id="msf-tags" className={styles.heading}>{t('msearch.sheet.tags')}</h3>
            {tags.length > 0 ? (
              <ul className={styles.options}>
                {tags.map((tag) => (
                  <li key={tag.id}>
                    <label className={styles.option}>
                      <input type="checkbox" className={styles.check} checked={draft.tags.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                      <span className={styles.name}>{tag.name}</span>
                      <span className={styles.n}>{tag.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            {facetsQ.isError ? <SectionError message={apiErrorMessage(t, facetsQ.error)} onRetry={() => void facetsQ.refetch()} /> : null}
          </section>
        ) : null}
        {rooms.length > 0 || roomsQ.isError ? (
          <section aria-labelledby="msf-room">
            <h3 id="msf-room" className={styles.heading}>{t('msearch.sheet.room')}</h3>
            {rooms.length > 0 ? (
              <ul className={styles.choices}>
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      aria-pressed={draft.room === room.id}
                      className={cx(styles.choice, draft.room === room.id && styles.on)}
                      onClick={() => pick('room', room.id)}
                    >
                      {room.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {roomsQ.isError ? <SectionError message={apiErrorMessage(t, roomsQ.error)} onRetry={() => void roomsQ.refetch()} /> : null}
          </section>
        ) : null}
      </div>
    </BottomSheet>
  );
}
