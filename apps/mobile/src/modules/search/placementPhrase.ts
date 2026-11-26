import type { useT } from '../../app/i18n';

/** "Libreria · ripiano 1 · posto 2": the one sentence that says where a book stands. Zero-based indexes in. */
export function placementPhrase(
  t: ReturnType<typeof useT>,
  place: { shelf?: string | null; row: number; slot: number },
): string {
  return t('msearch.detail.where.phrase', {
    shelf: place.shelf || t('msearch.detail.where.shelf'),
    row: place.row + 1,
    slot: place.slot + 1,
  });
}
