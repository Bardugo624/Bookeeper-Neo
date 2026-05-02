/**
 * modules/books/store.ts
 *
 * Pinia store del modulo books. Tiene la lista corrente, lo stato di
 * caricamento e la query di ricerca. La ricerca server-side è debounced
 * a livello di composable (useBookSearch); lo store si limita a invocare
 * l'endpoint passando `q`.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { booksEndpoints } from '@/lib/api/endpoints/books';
import type { Book, BookInput } from './types';

export const useBooksStore = defineStore('books', () => {
  const items = ref<Book[]>([]);
  const current = ref<Book | null>(null);

  const query = ref('');
  const loadingList = ref(false);
  const loadingDetail = ref(false);
  const saving = ref(false);
  const deleting = ref(false);
  const error = ref<string | null>(null);

  const isEmpty = computed(() => !loadingList.value && items.value.length === 0);
  const isSearching = computed(() => query.value.trim().length > 0);

  async function fetchList(q?: string): Promise<void> {
    loadingList.value = true;
    error.value = null;
    try {
      items.value = await booksEndpoints.list(q ?? query.value);
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loadingList.value = false;
    }
  }

  async function fetchOne(id: string): Promise<Book> {
    loadingDetail.value = true;
    error.value = null;
    try {
      const b = await booksEndpoints.get(id);
      current.value = b;
      return b;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loadingDetail.value = false;
    }
  }

  async function create(input: BookInput): Promise<string> {
    saving.value = true;
    error.value = null;
    try {
      const r = await booksEndpoints.create(input);
      // Refresh list so the new entry appears at the top.
      await fetchList();
      return r.id;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, input: BookInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await booksEndpoints.update(id, input);
      // Optimistic refresh: re-fetch only the affected record + sync list.
      const fresh = await booksEndpoints.get(id);
      current.value = fresh;
      const idx = items.value.findIndex((b) => b.id === id);
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
      await booksEndpoints.delete(id);
      items.value = items.value.filter((b) => b.id !== id);
      if (current.value?.id === id) current.value = null;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      deleting.value = false;
    }
  }

  /**
   * Cancella in batch. Restituisce il numero di righe effettivamente eliminate
   * (puo' essere < ids.length se alcune erano gia' sparite). La lista locale
   * viene filtrata in maniera ottimistica usando gli id richiesti, non solo
   * quelli confermati: e' coerente perche' anche se il server non ha trovato
   * un id, il client lo aveva e ora deve toglierlo.
   */
  async function batchDelete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    deleting.value = true;
    error.value = null;
    try {
      const r = await booksEndpoints.batchDelete(ids);
      const idSet = new Set(ids);
      items.value = items.value.filter((b) => !idSet.has(b.id));
      if (current.value && idSet.has(current.value.id)) current.value = null;
      return r.deleted;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      deleting.value = false;
    }
  }

  function setQuery(q: string): void {
    query.value = q;
  }

  function reset(): void {
    items.value = [];
    current.value = null;
    query.value = '';
    error.value = null;
  }

  return {
    // state
    items,
    current,
    query,
    loadingList,
    loadingDetail,
    saving,
    deleting,
    error,
    // getters
    isEmpty,
    isSearching,
    // actions
    fetchList,
    fetchOne,
    create,
    update,
    remove,
    batchDelete,
    setQuery,
    reset,
  };
});
