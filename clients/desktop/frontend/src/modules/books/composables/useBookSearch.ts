/**
 * useBookSearch — reactive composable che lega un input testuale alla
 * ricerca FTS server-side con debounce.
 *
 * Uso:
 *   const { input, isPending } = useBookSearch();
 *   <InputText v-model="input" />
 *
 * Il composable scrive `query` nello store e invoca `fetchList` solo
 * dopo `delayMs` di inattività, evitando bombardamenti del server
 * durante il typing.
 */
import { ref, watch } from 'vue';
import { useBooksStore } from '../store';

const DEFAULT_DELAY_MS = 300;

export function useBookSearch(initial = '', delayMs = DEFAULT_DELAY_MS) {
  const store = useBooksStore();
  const input = ref(initial);
  const isPending = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(input, (next) => {
    isPending.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      store.setQuery(next);
      void store.fetchList(next).finally(() => {
        isPending.value = false;
      });
    }, delayMs);
  });

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    store.setQuery(input.value);
    void store.fetchList(input.value).finally(() => {
      isPending.value = false;
    });
  }

  function clear(): void {
    input.value = '';
    flush();
  }

  return { input, isPending, flush, clear };
}
