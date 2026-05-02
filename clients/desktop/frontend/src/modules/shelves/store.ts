/**
 * modules/shelves/store.ts
 *
 * Pinia store per gli scaffali e l'assegnazione libri agli slot.
 *
 * Stato a due livelli:
 *  - `items`: lista globale degli scaffali (uso dashboard).
 *  - `currentBooks[shelfId]`: cache per-scaffale dei libri assegnati.
 *
 * La cache `currentBooks` evita refetch quando l'utente naviga avanti
 * e indietro tra dashboard e dettaglio. Le mutazioni (assign / unassign)
 * invalidano selettivamente l'entry interessata + la lista (per
 * aggiornare bookCount).
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { shelvesEndpoints } from '@/lib/api/endpoints/shelves';
import type {
  Shelf,
  ShelfBook,
  ShelfInput,
  ShelfAssignmentInput,
} from './types';

export const useShelvesStore = defineStore('shelves', () => {
  const items = ref<Shelf[]>([]);
  const currentBooks = ref<Record<string, ShelfBook[]>>({});

  const loadingList = ref(false);
  const loadingBooks = ref(false);
  const saving = ref(false);
  const deleting = ref(false);
  const error = ref<string | null>(null);

  const isEmpty = computed(
    () => !loadingList.value && items.value.length === 0,
  );

  function getById(id: string): Shelf | undefined {
    return items.value.find((s) => s.id === id);
  }

  function booksFor(shelfId: string): ShelfBook[] {
    return currentBooks.value[shelfId] ?? [];
  }

  async function fetchList(): Promise<void> {
    loadingList.value = true;
    error.value = null;
    try {
      items.value = await shelvesEndpoints.list();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loadingList.value = false;
    }
  }

  async function fetchBooks(shelfId: string): Promise<ShelfBook[]> {
    loadingBooks.value = true;
    error.value = null;
    try {
      const list = await shelvesEndpoints.listBooks(shelfId);
      currentBooks.value = { ...currentBooks.value, [shelfId]: list };
      return list;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loadingBooks.value = false;
    }
  }

  async function create(input: ShelfInput): Promise<string> {
    saving.value = true;
    error.value = null;
    try {
      const r = await shelvesEndpoints.create(input);
      await fetchList();
      return r.id;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, input: ShelfInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await shelvesEndpoints.update(id, input);
      const fresh = await shelvesEndpoints.get(id);
      const idx = items.value.findIndex((s) => s.id === id);
      if (idx >= 0) items.value[idx] = fresh;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string): Promise<void> {
    deleting.value = true;
    error.value = null;
    try {
      await shelvesEndpoints.delete(id);
      items.value = items.value.filter((s) => s.id !== id);
      const next = { ...currentBooks.value };
      delete next[id];
      currentBooks.value = next;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      deleting.value = false;
    }
  }

  async function assignBook(
    bookId: string,
    input: ShelfAssignmentInput,
  ): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await shelvesEndpoints.assignBook(bookId, input);
      // Invalida la cache dello scaffale di destinazione (e di quello
      // sorgente se diverso) e ricarica la lista per riflettere il nuovo
      // bookCount denormalizzato.
      const targets = new Set<string>();
      if (input.shelf_id) targets.add(input.shelf_id);
      for (const [sid, list] of Object.entries(currentBooks.value)) {
        if (list.some((b) => b.book_id === bookId)) targets.add(sid);
      }
      for (const sid of targets) await fetchBooks(sid);
      await fetchList();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function unassignBook(bookId: string): Promise<void> {
    return assignBook(bookId, {
      shelf_id: '',
      row_index: 0,
      slot_index: 0,
      spine_width: 1,
    });
  }

  /**
   * Assegna in batch una lista di libri a uno scaffale, riempiendo i primi
   * slot liberi server-side. Invalida la cache di TUTTI gli scaffali
   * possibilmente coinvolti (target + qualunque scaffale gia' caricato che
   * conteneva uno dei book_ids — improbabile dato che il server salta i
   * gia' piazzati, ma difensivo) e ricarica la lista per i contatori.
   */
  async function batchAssign(
    shelfId: string,
    bookIds: string[],
  ): Promise<{
    placed: { book_id: string; row_index: number; slot_index: number }[];
    skipped_already_placed: number;
    skipped_no_space: number;
  }> {
    saving.value = true;
    error.value = null;
    try {
      const result = await shelvesEndpoints.batchAssign(shelfId, bookIds);
      const targets = new Set<string>([shelfId]);
      const idSet = new Set(bookIds);
      for (const [sid, list] of Object.entries(currentBooks.value)) {
        if (list.some((b) => idSet.has(b.book_id))) targets.add(sid);
      }
      for (const sid of targets) {
        if (currentBooks.value[sid]) await fetchBooks(sid);
      }
      await fetchList();
      return result;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  function reset(): void {
    items.value = [];
    currentBooks.value = {};
    error.value = null;
  }

  return {
    // state
    items,
    currentBooks,
    loadingList,
    loadingBooks,
    saving,
    deleting,
    error,
    // getters
    isEmpty,
    getById,
    booksFor,
    // actions
    fetchList,
    fetchBooks,
    create,
    update,
    remove,
    assignBook,
    unassignBook,
    batchAssign,
    reset,
  };
});
