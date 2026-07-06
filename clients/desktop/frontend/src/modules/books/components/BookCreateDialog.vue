<script setup lang="ts">
/**
 * BookCreateDialog — modale per inserire un nuovo libro.
 * Usa useBookForm + BookFormFields. Emette `created(id)` al successo.
 *
 * Estensioni:
 *  - Suggerisce il prossimo numero progressivo libero (call a
 *    /books/next-progressive ogni volta che il dialog viene aperto).
 *  - Permette di assegnare il libro a uno scaffale esistente al momento
 *    della creazione: dopo create() invoca shelves.batchAssign con il
 *    nuovo id (1 elemento). In caso di errore di placement il libro
 *    resta creato — mostriamo un warning ma chiudiamo comunque il dialog
 *    perche' sarebbe peggio far fallire l'intera operazione.
 */
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import BookFormFields from './BookFormFields.vue';
import { useBookForm } from '../composables/useBookForm';
import { booksEndpoints } from '@/lib/api/endpoints/books';
import { useShelvesStore } from '@/modules/shelves/store';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'created', id: string): void;
  /** Avviso non bloccante: libro creato ma placement fallito o no-space. */
  (e: 'placementWarning', message: string): void;
}>();

const { form, authorsRaw, submitError, submit, reset } = useBookForm(null);
const submitting = ref(false);
const { t } = useI18n();

const shelvesStore = useShelvesStore();
const targetShelfId = ref<string | null>(null);
const suggestedProgressive = ref<number | null>(null);

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    reset(null);
    targetShelfId.value = null;
    suggestedProgressive.value = null;
    // Carica scaffali (no-op se gia' caricati ma sicuro) e prossimo
    // progressive in parallelo. Errori silenziati: il dialog deve
    // comunque essere usabile anche se queste call falliscono.
    Promise.all([
      shelvesStore.items.length === 0 ? shelvesStore.fetchList() : Promise.resolve(),
      booksEndpoints
        .nextProgressive()
        .then((r) => {
          suggestedProgressive.value = r.next;
        })
        .catch(() => {
          suggestedProgressive.value = null;
        }),
    ]).catch(() => {
      /* swallow */
    });
  },
);

async function onSave(): Promise<void> {
  submitting.value = true;
  try {
    const id = await submit();
    // Placement opzionale: best-effort, non bloccante.
    if (targetShelfId.value) {
      try {
        const r = await shelvesStore.batchAssign(targetShelfId.value, [id]);
        if (r.skipped_no_space > 0) {
          emit('placementWarning', t('books.create.warnFull'));
        }
      } catch (e) {
        emit('placementWarning', t('books.create.warnAssign', { msg: (e as Error).message }));
      }
    }
    emit('created', id);
    emit('update:visible', false);
  } catch {
    // submitError già popolato dal composable
  } finally {
    submitting.value = false;
  }
}

function close(): void {
  if (!submitting.value) emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v) => emit('update:visible', v)"
    modal
    :header="t('books.create.header')"
    :style="{ width: 'min(720px, 92vw)' }"
    :closable="!submitting"
  >
    <BookFormFields
      :form="form"
      :authors-raw="authorsRaw"
      :error-message="submitError"
      :suggested-progressive="suggestedProgressive"
      @update:form="(v) => Object.assign(form, v)"
      @update:authors-raw="(v) => (authorsRaw = v)"
    />

    <div class="book-create__shelf">
      <label class="book-create__shelf-label" for="bf-target-shelf">
        <i class="pi pi-bookmark" aria-hidden="true" />
        {{ t('books.create.addToShelf') }}
        <span class="book-create__shelf-hint">{{ t('common.optional') }}</span>
      </label>
      <Select
        id="bf-target-shelf"
        v-model="targetShelfId"
        :options="shelvesStore.items"
        option-label="name"
        option-value="id"
        :placeholder="t('books.create.noShelf')"
        show-clear
        :loading="shelvesStore.loadingList"
        :empty-message="shelvesStore.loadingList ? t('common.loading') : t('books.create.noShelves')"
        fluid
      >
        <template #option="{ option }">
          <div class="book-create__shelf-option">
            <span class="book-create__shelf-name">{{ option.name }}</span>
            <span class="book-create__shelf-meta">
              {{ option.book_count }} / {{ option.capacity }}
            </span>
          </div>
        </template>
      </Select>
      <p class="book-create__shelf-help">
        {{ t('books.create.shelfHelp') }}
      </p>
    </div>

    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text :disabled="submitting" @click="close" />
      <Button
        :label="t('common.save')"
        icon="pi pi-check"
        :loading="submitting"
        :disabled="!form.title.trim()"
        @click="onSave"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.book-create__shelf {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--p-surface-300);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.book-create__shelf-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-surface-700);
  letter-spacing: 0.01em;
}
.book-create__shelf-hint {
  font-weight: 400;
  color: var(--p-surface-500);
}
.book-create__shelf-help {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-surface-500);
}
.book-create__shelf-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}
.book-create__shelf-meta {
  font-size: 0.75rem;
  color: var(--p-surface-500);
  font-variant-numeric: tabular-nums;
}
</style>

<style>
html.dark .book-create__shelf {
  border-top-color: var(--p-surface-700);
}
html.dark .book-create__shelf-label {
  color: var(--p-surface-200);
}
html.dark .book-create__shelf-hint,
html.dark .book-create__shelf-help,
html.dark .book-create__shelf-meta {
  color: var(--p-surface-400);
}
</style>
