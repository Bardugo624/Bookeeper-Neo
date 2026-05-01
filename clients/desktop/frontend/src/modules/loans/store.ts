/**
 * modules/loans/store.ts
 *
 * Pinia setup store per i prestiti. Mantiene la lista in memoria con
 * stato di stato derivato (active/overdue/returned) per evitare ricalcoli
 * sparsi nelle viste. Refetch dopo create/update/return per allineare
 * con eventuali modifiche server-side (es. modifiche da mobile).
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { loansEndpoints } from '@/lib/api/endpoints/loans';
import { deriveStatus, type Loan, type LoanInput, type LoanStatus } from './types';

export const useLoansStore = defineStore('loans', () => {
  const items = ref<Loan[]>([]);

  const loadingList = ref(false);
  const saving = ref(false);
  const deleting = ref(false);
  const returning = ref(false);
  const error = ref<string | null>(null);

  /** Tick reattivo per ricalcolare gli stati ogni minuto senza polling rete. */
  const nowSec = ref(Math.floor(Date.now() / 1000));
  let tickHandle: ReturnType<typeof setInterval> | null = null;

  function startTicker(): void {
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      nowSec.value = Math.floor(Date.now() / 1000);
    }, 60_000);
  }

  function stopTicker(): void {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  const isEmpty = computed(
    () => !loadingList.value && items.value.length === 0,
  );

  /** Conteggio per stato — usato dai filter pill nella vista. */
  const countByStatus = computed<Record<LoanStatus, number>>(() => {
    const acc: Record<LoanStatus, number> = { active: 0, overdue: 0, returned: 0 };
    for (const l of items.value) acc[deriveStatus(l, nowSec.value)] += 1;
    return acc;
  });

  function getById(id: string): Loan | undefined {
    return items.value.find((l) => l.id === id);
  }

  async function fetchList(): Promise<void> {
    loadingList.value = true;
    error.value = null;
    try {
      items.value = await loansEndpoints.list();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loadingList.value = false;
    }
  }

  async function create(input: LoanInput): Promise<string> {
    saving.value = true;
    error.value = null;
    try {
      const r = await loansEndpoints.create(input);
      await fetchList();
      return r.id;
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, input: LoanInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await loansEndpoints.update(id, input);
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
      await loansEndpoints.delete(id);
      items.value = items.value.filter((l) => l.id !== id);
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      deleting.value = false;
    }
  }

  async function markReturned(id: string): Promise<void> {
    returning.value = true;
    error.value = null;
    try {
      await loansEndpoints.return(id);
      await fetchList();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      returning.value = false;
    }
  }

  async function reopen(id: string): Promise<void> {
    returning.value = true;
    error.value = null;
    try {
      await loansEndpoints.reopen(id);
      await fetchList();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      returning.value = false;
    }
  }

  function reset(): void {
    items.value = [];
    error.value = null;
    stopTicker();
  }

  return {
    items, loadingList, saving, deleting, returning, error,
    nowSec, isEmpty, countByStatus, getById,
    startTicker, stopTicker,
    fetchList, create, update, remove, markReturned, reopen, reset,
  };
});
