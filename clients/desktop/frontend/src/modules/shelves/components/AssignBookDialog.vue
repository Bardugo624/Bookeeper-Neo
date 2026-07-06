<script setup lang="ts">
/**
 * AssignBookDialog — modale per assegnare un libro a uno scaffale
 * cliccando direttamente lo slot di destinazione su un'anteprima SVG.
 *
 * Flow:
 *  1. l'utente seleziona uno scaffale dal dropdown
 *  2. lo `ShelfSvg` mostra slot occupati (grigio) + vuoti (cliccabili)
 *  3. click su slot vuoto → chiama `onAssign` ed emette `submit`
 *
 * Utilizzato da BookEditView (Phase 4) e da ShelfDetailView ("aggiungi
 * libro a questo scaffale" via picker libreria — fuori scope qui).
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import type { Shelf, ShelfBook } from '../types';
import ShelfSvg from './ShelfSvg.vue';
import { useShelvesStore } from '../store';

interface Props {
  visible: boolean;
  bookId: string;
  bookTitle: string;
  /** Posizionamento corrente del libro (se già su uno scaffale). */
  currentPlacement?: ShelfBook | null;
}
const props = withDefaults(defineProps<Props>(), { currentPlacement: null });

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'assigned'): void;
}>();

const store = useShelvesStore();
const { t } = useI18n();

const selectedShelfId = ref<string | null>(null);
const submitting = ref(false);
const localError = ref<string | null>(null);

const shelfOptions = computed(() =>
  store.items.map((s) => ({
    label: `${s.name} · ${s.book_count}/${s.capacity}`,
    value: s.id,
  })),
);

const selectedShelf = computed<Shelf | null>(() =>
  selectedShelfId.value
    ? store.items.find((s) => s.id === selectedShelfId.value) ?? null
    : null,
);

const selectedBooks = computed<ShelfBook[]>(() =>
  selectedShelfId.value ? store.booksFor(selectedShelfId.value) : [],
);

const hasFreeSlot = computed(() => {
  const sh = selectedShelf.value;
  if (!sh) return false;
  return selectedBooks.value.length < sh.capacity;
});

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      localError.value = null;
      // Pre-load shelves and pick the current one if any.
      if (store.items.length === 0) await store.fetchList();
      selectedShelfId.value =
        props.currentPlacement?.shelf_id ?? store.items[0]?.id ?? null;
      if (selectedShelfId.value) await store.fetchBooks(selectedShelfId.value);
    }
  },
);

watch(selectedShelfId, async (id) => {
  if (id) await store.fetchBooks(id);
});

async function onPickSlot(payload: {
  rowIndex: number;
  slotIndex: number;
}): Promise<void> {
  if (!selectedShelfId.value) return;
  submitting.value = true;
  localError.value = null;
  try {
    await store.assignBook(props.bookId, {
      shelf_id: selectedShelfId.value,
      row_index: payload.rowIndex,
      slot_index: payload.slotIndex,
      spine_width: 1,
    });
    emit('assigned');
    emit('update:visible', false);
  } catch (e) {
    localError.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}

async function onUnassign(): Promise<void> {
  submitting.value = true;
  localError.value = null;
  try {
    await store.unassignBook(props.bookId);
    emit('assigned');
    emit('update:visible', false);
  } catch (e) {
    localError.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}

function close(): void {
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :modal="true"
    :closable="!submitting"
    :dismissable-mask="!submitting"
    :style="{ width: '720px', maxWidth: '95vw' }"
    :header="t('shelves.assign.header', { title: bookTitle })"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="assign">
      <Message
        v-if="localError"
        severity="error"
        :closable="false"
      >
        {{ localError }}
      </Message>
      <Message
        v-else
        severity="info"
        :closable="false"
      >
        {{ t('shelves.assign.hint') }}
      </Message>

      <div class="assign__controls">
        <label for="assign-shelf" class="assign__label">{{ t('shelves.assign.shelfLabel') }}</label>
        <Select
          id="assign-shelf"
          v-model="selectedShelfId"
          :options="shelfOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('shelves.assign.shelfPlaceholder')"
          class="assign__select"
        />
        <Button
          v-if="currentPlacement"
          :label="t('shelves.assign.removePlacement')"
          icon="pi pi-times-circle"
          severity="danger"
          text
          :loading="submitting"
          @click="onUnassign"
        />
      </div>

      <div v-if="selectedShelf && !hasFreeSlot" class="assign__warning">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        {{ t('shelves.assign.full') }}
      </div>

      <div v-if="store.loadingBooks" class="assign__loading">
        <ProgressSpinner style="width: 32px; height: 32px" stroke-width="4" />
      </div>

      <div v-else-if="selectedShelf" class="assign__svg-wrap">
        <ShelfSvg
          :shelf="selectedShelf"
          :books="selectedBooks"
          :interactive="!submitting && hasFreeSlot"
          @pick-slot="onPickSlot"
        />
      </div>

      <p v-else class="assign__empty">
        {{ t('shelves.assign.empty') }}
      </p>
    </div>

    <template #footer>
      <Button
        :label="t('shelves.assign.close')"
        severity="secondary"
        text
        :disabled="submitting"
        @click="close"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.assign {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.assign__controls {
  display: flex;
  align-items: end;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.assign__label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--p-surface-700);
}
.assign__select {
  flex: 1 1 240px;
}
.assign__warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--p-amber-500, #d97706) 15%, transparent);
  color: var(--p-amber-700, #b45309);
  font-size: 0.875rem;
}
.assign__loading {
  display: flex;
  justify-content: center;
  padding: 2rem;
}
.assign__svg-wrap {
  background: var(--p-surface-50);
  padding: 1rem;
  border-radius: 12px;
  max-height: 60vh;
  overflow: auto;
}
.assign__empty {
  color: var(--p-surface-500);
  text-align: center;
  padding: 2rem;
}
</style>

<style>
html.dark .assign__label {
  color: var(--p-surface-200);
}
html.dark .assign__svg-wrap {
  background: var(--p-surface-900);
}
html.dark .assign__warning {
  background: color-mix(in srgb, var(--p-amber-500, #d97706) 25%, transparent);
  color: var(--p-amber-300, #fbbf24);
}
</style>
