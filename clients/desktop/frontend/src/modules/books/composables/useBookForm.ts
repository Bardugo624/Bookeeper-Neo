/**
 * useBookForm — gestisce lo stato di un form create/edit per Book.
 *
 * Centralizza:
 *   - reactive state (BookInput)
 *   - validazione minimale (title non vuoto)
 *   - submit unificato (create vs update in base alla presenza di id)
 *   - parsing del campo authors (textarea separata da newline o virgola)
 */
import { computed, reactive, ref } from 'vue';
import { useBooksStore } from '../store';
import type { Book, BookInput } from '../types';
import { EMPTY_BOOK_INPUT, toBookInput } from '../types';

export function useBookForm(initial?: Book | null) {
  const store = useBooksStore();
  const form = reactive<BookInput>(
    initial ? toBookInput(initial) : { ...EMPTY_BOOK_INPUT, authors: [] },
  );
  const authorsRaw = ref<string>(initial ? initial.authors.join('\n') : '');
  const submitError = ref<string | null>(null);

  const isValid = computed(() => form.title.trim().length > 0);

  function syncAuthors(): void {
    form.authors = authorsRaw.value
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function reset(b?: Book | null): void {
    Object.assign(form, b ? toBookInput(b) : { ...EMPTY_BOOK_INPUT, authors: [] });
    authorsRaw.value = b ? b.authors.join('\n') : '';
    submitError.value = null;
  }

  /**
   * Salva il record. Restituisce l'id (utile per redirect post-create).
   * Lancia su errore — il chiamante decide se loggare o mostrare un toast.
   */
  async function submit(id?: string): Promise<string> {
    submitError.value = null;
    syncAuthors();
    if (!isValid.value) {
      submitError.value = 'Il titolo è obbligatorio.';
      throw new Error(submitError.value);
    }
    try {
      if (id) {
        await store.update(id, form);
        return id;
      }
      return await store.create(form);
    } catch (e) {
      submitError.value = (e as Error).message;
      throw e;
    }
  }

  return { form, authorsRaw, isValid, submitError, syncAuthors, reset, submit };
}
