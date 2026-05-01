/**
 * modules/stats/store.ts
 *
 * Pinia store per la dashboard. Singolo payload caricato all'apertura della
 * vista; un'azione `refresh()` esposta in UI permette di ricaricare on demand
 * senza ri-mount del componente.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { statsEndpoints } from '@/lib/api/endpoints/stats';
import type { StatsResponse } from './types';

export const useStatsStore = defineStore('stats', () => {
  const data = ref<StatsResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetched = ref<number | null>(null); // unix ms

  const isEmpty = computed(
    () => !!data.value && data.value.overview.total_books === 0,
  );

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      data.value = await statsEndpoints.overview();
      lastFetched.value = Date.now();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Errore caricamento statistiche';
    } finally {
      loading.value = false;
    }
  }

  async function refresh(): Promise<void> {
    await fetch();
  }

  function reset(): void {
    data.value = null;
    error.value = null;
    lastFetched.value = null;
  }

  return { data, loading, error, lastFetched, isEmpty, fetch, refresh, reset };
});
