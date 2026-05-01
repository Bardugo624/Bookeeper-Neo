import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { wishlistEndpoints } from '@/lib/api/endpoints/wishlist';
import type { WishlistInput, WishlistItem } from './types';

export const useWishlistStore = defineStore('wishlist', () => {
  const items = ref<WishlistItem[]>([]);

  const loadingList = ref(false);
  const saving = ref(false);
  const deleting = ref(false);
  const converting = ref(false);
  const error = ref<string | null>(null);

  const isEmpty = computed(
    () => !loadingList.value && items.value.length === 0,
  );

  const countByPriority = computed<Record<number, number>>(() => {
    const acc: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    for (const it of items.value) acc[it.priority] = (acc[it.priority] ?? 0) + 1;
    return acc;
  });

  function getById(id: string): WishlistItem | undefined {
    return items.value.find((w) => w.id === id);
  }

  async function fetchList(): Promise<void> {
    loadingList.value = true;
    error.value = null;
    try {
      items.value = await wishlistEndpoints.list();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loadingList.value = false;
    }
  }

  async function create(input: WishlistInput): Promise<string> {
    saving.value = true;
    error.value = null;
    try {
      const r = await wishlistEndpoints.create(input);
      await fetchList();
      return r.id;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, input: WishlistInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await wishlistEndpoints.update(id, input);
      await fetchList();
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
      await wishlistEndpoints.delete(id);
      items.value = items.value.filter((w) => w.id !== id);
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      deleting.value = false;
    }
  }

  /**
   * Promuove la voce a libro: rimuove dalla wishlist e ritorna `book_id`
   * del nuovo libro così il caller può navigare al dettaglio.
   */
  async function convert(id: string): Promise<string> {
    converting.value = true;
    error.value = null;
    try {
      const r = await wishlistEndpoints.convert(id);
      items.value = items.value.filter((w) => w.id !== id);
      return r.book_id;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      converting.value = false;
    }
  }

  function reset(): void {
    items.value = [];
    error.value = null;
  }

  return {
    items, loadingList, saving, deleting, converting, error,
    isEmpty, countByPriority, getById,
    fetchList, create, update, remove, convert, reset,
  };
});
