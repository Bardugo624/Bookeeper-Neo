<script setup lang="ts">
/**
 * MoveToShelfDialog — modale per piazzare uno o più libri sul primo slot
 * libero di uno scaffale esistente.
 *
 * Usata sia dalla riga singola della tabella (un solo bookId) sia dal
 * toolbar di selezione multipla (N bookIds). Riusare un unico componente
 * evita di duplicare la UI di selezione scaffale.
 *
 * Server-side il batch-assign salta libri gia' piazzati su altri scaffali
 * (skipped_already_placed) e quelli per cui non c'e' piu' spazio
 * (skipped_no_space). Mostriamo entrambi i contatori al ritorno.
 */
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Message from 'primevue/message';
import { useShelvesStore } from '@/modules/shelves/store';

const props = defineProps<{
  visible: boolean;
  bookIds: string[];
}>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  /** Emesso al successo. payload = result del batch (utile per toast). */
  (e: 'assigned', payload: { placed: number; skippedAlreadyPlaced: number; skippedNoSpace: number }): void;
}>();

const shelvesStore = useShelvesStore();
const targetShelfId = ref<string | null>(null);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const targetShelf = computed(() =>
  targetShelfId.value
    ? shelvesStore.items.find((s) => s.id === targetShelfId.value) ?? null
    : null,
);

const freeSlots = computed<number | null>(() => {
  const s = targetShelf.value;
  if (!s) return null;
  return Math.max(0, s.capacity - s.book_count);
});

const willOverflow = computed<boolean>(() => {
  if (freeSlots.value == null) return false;
  return props.bookIds.length > freeSlots.value;
});

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    targetShelfId.value = null;
    errorMessage.value = null;
    if (shelvesStore.items.length === 0) {
      shelvesStore.fetchList().catch(() => {
        errorMessage.value = 'Impossibile caricare la lista degli scaffali.';
      });
    }
  },
);

async function onConfirm(): Promise<void> {
  if (!targetShelfId.value || props.bookIds.length === 0) return;
  submitting.value = true;
  errorMessage.value = null;
  try {
    const r = await shelvesStore.batchAssign(targetShelfId.value, props.bookIds);
    emit('assigned', {
      placed: r.placed.length,
      skippedAlreadyPlaced: r.skipped_already_placed,
      skippedNoSpace: r.skipped_no_space,
    });
    emit('update:visible', false);
  } catch (e) {
    errorMessage.value = (e as Error).message;
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
    :header="bookIds.length === 1 ? 'Sposta libro su scaffale' : `Sposta ${bookIds.length} libri su scaffale`"
    :style="{ width: 'min(520px, 92vw)' }"
    :closable="!submitting"
  >
    <div class="move-shelf">
      <p class="move-shelf__intro">
        Seleziona uno scaffale: i libri verranno collocati nei primi slot liberi
        in ordine di riga. Verranno saltati i libri già presenti su altri scaffali.
      </p>

      <Select
        v-model="targetShelfId"
        :options="shelvesStore.items"
        option-label="name"
        option-value="id"
        placeholder="Seleziona scaffale…"
        :loading="shelvesStore.loadingList"
        :empty-message="shelvesStore.loadingList ? 'Caricamento…' : 'Nessuno scaffale disponibile'"
        fluid
        :disabled="submitting"
      >
        <template #option="{ option }">
          <div class="move-shelf__option">
            <span class="move-shelf__name">{{ option.name }}</span>
            <span class="move-shelf__meta">
              {{ option.book_count }} / {{ option.capacity }}
            </span>
          </div>
        </template>
      </Select>

      <div v-if="targetShelf" class="move-shelf__capacity">
        <span class="move-shelf__capacity-label">Slot liberi:</span>
        <strong class="move-shelf__capacity-value">{{ freeSlots }}</strong>
        <span class="move-shelf__capacity-sep">/</span>
        <span>{{ targetShelf.capacity }}</span>
      </div>

      <Message
        v-if="willOverflow"
        severity="warn"
        :closable="false"
        class="move-shelf__warn"
      >
        Lo scaffale ha {{ freeSlots }} slot liberi ma stai cercando di spostare
        {{ bookIds.length }} libri. I primi {{ freeSlots }} verranno collocati,
        gli altri verranno saltati.
      </Message>

      <Message
        v-if="errorMessage"
        severity="error"
        :closable="false"
        class="move-shelf__warn"
      >
        {{ errorMessage }}
      </Message>
    </div>

    <template #footer>
      <Button
        label="Annulla"
        severity="secondary"
        text
        :disabled="submitting"
        @click="close"
      />
      <Button
        label="Sposta"
        icon="pi pi-arrow-right"
        :loading="submitting"
        :disabled="!targetShelfId || bookIds.length === 0"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.move-shelf {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}
.move-shelf__intro {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-surface-600);
  line-height: 1.5;
}
.move-shelf__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}
.move-shelf__meta {
  font-size: 0.75rem;
  color: var(--p-surface-500);
  font-variant-numeric: tabular-nums;
}
.move-shelf__capacity {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  background: var(--p-surface-100);
  font-size: 0.85rem;
  color: var(--p-surface-700);
  font-variant-numeric: tabular-nums;
}
.move-shelf__capacity-label {
  font-weight: 500;
  color: var(--p-surface-600);
}
.move-shelf__capacity-value {
  font-size: 1rem;
  color: var(--p-primary-700);
}
.move-shelf__capacity-sep {
  color: var(--p-surface-400);
}
.move-shelf__warn {
  margin: 0;
}
</style>

<style>
html.dark .move-shelf__intro {
  color: var(--p-surface-300);
}
html.dark .move-shelf__capacity {
  background: var(--p-surface-800);
  color: var(--p-surface-200);
}
html.dark .move-shelf__capacity-label {
  color: var(--p-surface-300);
}
html.dark .move-shelf__capacity-value {
  color: var(--p-primary-300);
}
html.dark .move-shelf__meta {
  color: var(--p-surface-400);
}
</style>
