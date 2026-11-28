import type { FromFrame } from '../engine/protocol';
import type { SectionMap } from './sections';

interface Excerpt {
  pre: string;
  match: string;
  post: string;
}
type Step = 'done' | { progress: number } | { label?: string; subitems: { cfi: string; excerpt: Excerpt }[] };

export interface SearchableView {
  search(opts: { query: string; drawOptions?: unknown }): AsyncIterable<Step>;
  clearSearch(): void;
  resolveCFI(cfi: string): { index: number } | Promise<{ index: number }>;
}

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Runs one search and reports it as messages. Between two steps it gives the page back to the browser, so a long
 * book never holds up a page turn. Stops at the first step after `cancelled()` turns true.
 */
export async function runSearch(
  view: SearchableView,
  map: SectionMap,
  id: number,
  query: string,
  draw: { drawOptions: unknown },
  send: (msg: FromFrame) => void,
  cancelled: () => boolean,
): Promise<void> {
  try {
    for await (const step of view.search({ query, ...draw })) {
      if (cancelled()) return;
      if (step === 'done') break;
      if ('progress' in step) {
        send({ type: 'search-progress', id, fraction: step.progress });
      } else {
        for (const item of step.subitems) {
          let fraction = 0;
          try {
            fraction = map.fractionOf((await view.resolveCFI(item.cfi)).index, 0);
          } catch {
            // A hit whose section cannot be placed still counts; it sits at the start of the book.
          }
          send({
            type: 'search-result',
            id,
            cfi: item.cfi,
            fraction,
            sectionLabel: step.label || null,
            pre: item.excerpt.pre,
            match: item.excerpt.match,
            post: item.excerpt.post,
          });
        }
      }
      await breathe();
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (!cancelled()) send({ type: 'search-done', id });
  }
}
