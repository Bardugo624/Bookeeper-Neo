<script setup lang="ts">
/**
 * ShelfDetailView — pagina /shelves/:id.
 *
 * Layout a due colonne su desktop:
 *  - sinistra: SVG grande dello scaffale (interattivo)
 *  - destra: tabella libri assegnati con azione "rimuovi"
 *
 * Se la query string contiene `?row=&slot=`, il componente apre subito
 * un picker libreria (stub: per ora mostra solo un message). Quando
 * l'utente clicca uno slot vuoto, viene aggiornata la query e mostrato
 * lo stesso picker.
 *
 * Il picker libri è un compromesso pragmatico: mostra i libri NON ancora
 * posizionati su nessuno scaffale (filtrati client-side). Per cataloghi
 * grandi conviene aggiungere un endpoint dedicato server-side.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import { useShelvesStore } from '../store';
import { useBooksStore } from '@/modules/books/store';
import type { Shelf, ShelfBook, ShelfInput } from '../types';
import { shelfToInput } from '../types';
import ShelfSvg from '../components/ShelfSvg.vue';
import ShelfFillBar from '../components/ShelfFillBar.vue';
import ShelfConfigDialog from '../components/ShelfConfigDialog.vue';
import { useShelfFill } from '../composables/useShelfFill';

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();

const shelvesStore = useShelvesStore();
const booksStore = useBooksStore();

const editVisible = ref(false);
const editInitial = ref<ShelfInput | null>(null);
const editError = ref<string | null>(null);

const pickerVisible = ref(false);
const pickerSlot = ref<{ row: number; slot: number } | null>(null);
const pickerBookId = ref<string | null>(null);
const pickerError = ref<string | null>(null);

const shelf = computed<Shelf | null>(
  () => shelvesStore.getById(props.id) ?? null,
);
const books = computed<ShelfBook[]>(() =>
  shelvesStore.booksFor(props.id),
);

const shelfRefForFill = computed(() => shelf.value);
const booksRefForFill = computed(() => books.value);
const { fill } = useShelfFill(
  // useShelfFill tollera shelf null restituendo zeros via fallback nel
  // composable; qui passiamo un proxy non-null per il typing.
  computed(() => shelfRefForFill.value as Shelf),
  booksRefForFill,
);

const placedBookIds = computed(
  () => new Set(books.value.map((b) => b.book_id)),
);
const pickerOptions = computed(() =>
  booksStore.items
    .filter((b) => !placedBookIds.value.has(b.id))
    .map((b) => ({
      label: b.authors.length
        ? `${b.title} — ${b.authors.join(', ')}`
        : b.title,
      value: b.id,
    })),
);

async function loadShelf(): Promise<void> {
  if (shelvesStore.items.length === 0) await shelvesStore.fetchList();
  await shelvesStore.fetchBooks(props.id);
}

onMounted(async () => {
  await loadShelf();
  // Se siamo arrivati dalla dashboard con uno slot pre-selezionato,
  // apri il picker.
  const r = route.query.row;
  const s = route.query.slot;
  if (typeof r === 'string' && typeof s === 'string') {
    const row = Number(r);
    const slot = Number(s);
    if (Number.isFinite(row) && Number.isFinite(slot)) {
      openPickerForSlot(row, slot);
    }
  }
});

watch(
  () => props.id,
  async () => {
    await loadShelf();
  },
);

function openEdit(): void {
  if (!shelf.value) return;
  editInitial.value = shelfToInput(shelf.value);
  editError.value = null;
  editVisible.value = true;
}
async function onSubmitEdit(input: ShelfInput): Promise<void> {
  if (!shelf.value) return;
  editError.value = null;
  try {
    await shelvesStore.update(shelf.value.id, input);
    editVisible.value = false;
  } catch (e) {
    editError.value = (e as Error).message;
  }
}
function onDelete(): void {
  if (!shelf.value) return;
  const sh = shelf.value;
  confirm.require({
    header: 'Elimina scaffale',
    message:
      sh.book_count > 0
        ? `“${sh.name}” contiene ${sh.book_count} libri. Saranno rimossi i posizionamenti, ma i libri restano in libreria. Procedere?`
        : `Eliminare “${sh.name}”?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Elimina',
    rejectLabel: 'Annulla',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await shelvesStore.remove(sh.id);
        router.push({ name: 'shelves' });
      } catch {
        /* in store.error */
      }
    },
  });
}

async function openPickerForSlot(row: number, slot: number): Promise<void> {
  pickerSlot.value = { row, slot };
  pickerBookId.value = null;
  pickerError.value = null;
  pickerVisible.value = true;
  if (booksStore.items.length === 0) {
    try {
      await booksStore.fetchList();
    } catch {
      /* ignore */
    }
  }
}

function onPickSlot(payload: { rowIndex: number; slotIndex: number }): void {
  // Verifica slot libero (lo SVG già nasconde i pieni dal click ma
  // doppio check per sicurezza).
  const occupied = books.value.some(
    (b) => b.row_index === payload.rowIndex && b.slot_index === payload.slotIndex,
  );
  if (occupied) return;
  router.replace({
    query: {
      ...route.query,
      row: String(payload.rowIndex),
      slot: String(payload.slotIndex),
    },
  });
  openPickerForSlot(payload.rowIndex, payload.slotIndex);
}

async function confirmPicker(): Promise<void> {
  if (!pickerSlot.value || !pickerBookId.value || !shelf.value) return;
  pickerError.value = null;
  try {
    await shelvesStore.assignBook(pickerBookId.value, {
      shelf_id: shelf.value.id,
      row_index: pickerSlot.value.row,
      slot_index: pickerSlot.value.slot,
      spine_width: 1,
    });
    closePicker();
  } catch (e) {
    pickerError.value = (e as Error).message;
  }
}

function closePicker(): void {
  pickerVisible.value = false;
  pickerSlot.value = null;
  pickerBookId.value = null;
  // pulisci la query
  if (route.query.row !== undefined || route.query.slot !== undefined) {
    const q = { ...route.query };
    delete q.row;
    delete q.slot;
    router.replace({ query: q });
  }
}

async function removePlacement(book: ShelfBook): Promise<void> {
  try {
    await shelvesStore.unassignBook(book.book_id);
  } catch {
    /* in store.error */
  }
}

function backToList(): void {
  router.push({ name: 'shelves' });
}
function openBook(id: string): void {
  router.push({ name: 'book-detail', params: { id } });
}
</script>

<template>
  <section class="shelf-detail" aria-labelledby="shelf-detail-title">
    <header class="shelf-detail__header">
      <Button
        icon="pi pi-arrow-left"
        text
        severity="secondary"
        aria-label="Torna agli scaffali"
        @click="backToList"
      />
      <div class="shelf-detail__title-wrap">
        <h1 id="shelf-detail-title" class="shelf-detail__title">
          {{ shelf?.name ?? 'Scaffale' }}
        </h1>
        <p v-if="shelf" class="shelf-detail__sub">
          {{ shelf.rows }} mensole × {{ shelf.slots_per_row }} slot ·
          {{ shelf.book_count }}/{{ shelf.capacity }} libri
        </p>
      </div>
      <div class="shelf-detail__actions">
        <Button
          label="Modifica"
          icon="pi pi-pencil"
          severity="secondary"
          outlined
          :disabled="!shelf"
          @click="openEdit"
        />
        <Button
          label="Elimina"
          icon="pi pi-trash"
          severity="danger"
          outlined
          :disabled="!shelf"
          @click="onDelete"
        />
      </div>
    </header>

    <Message
      v-if="shelvesStore.error"
      severity="error"
      :closable="false"
    >
      {{ shelvesStore.error }}
    </Message>

    <div v-if="!shelf && shelvesStore.loadingList" class="shelf-detail__loading">
      <Skeleton height="320px" border-radius="14px" />
      <Skeleton height="120px" border-radius="14px" />
    </div>

    <div v-else-if="shelf" class="shelf-detail__layout">
      <div class="shelf-detail__svg-card">
        <ShelfFillBar :fill="fill" />
        <div class="shelf-detail__svg">
          <ShelfSvg
            :shelf="shelf"
            :books="books"
            :show-spine-titles="true"
            @open-book="openBook"
            @pick-slot="onPickSlot"
          />
        </div>
        <p class="shelf-detail__hint">
          <i class="pi pi-info-circle" aria-hidden="true" />
          Clicca uno slot vuoto per assegnarvi un libro.
        </p>
      </div>

      <aside class="shelf-detail__books">
        <h2 class="shelf-detail__books-title">Libri assegnati</h2>
        <DataTable
          :value="books"
          data-key="book_id"
          :empty-message="'Nessun libro su questo scaffale'"
          striped-rows
          size="small"
          scrollable
          scroll-height="60vh"
        >
          <Column field="title" header="Titolo">
            <template #body="{ data }: { data: ShelfBook }">
              <button class="shelf-detail__book-link" @click="openBook(data.book_id)">
                {{ data.title }}
              </button>
            </template>
          </Column>
          <Column header="Pos." style="width: 90px">
            <template #body="{ data }: { data: ShelfBook }">
              <span class="shelf-detail__pos">
                M{{ data.row_index + 1 }} · S{{ data.slot_index + 1 }}
              </span>
            </template>
          </Column>
          <Column header="" style="width: 56px">
            <template #body="{ data }: { data: ShelfBook }">
              <Button
                icon="pi pi-times"
                text
                rounded
                severity="danger"
                size="small"
                aria-label="Rimuovi dal scaffale"
                @click="removePlacement(data)"
              />
            </template>
          </Column>
        </DataTable>
      </aside>
    </div>

    <Message v-else severity="warn" :closable="false">
      Scaffale non trovato.
    </Message>

    <ShelfConfigDialog
      v-model:visible="editVisible"
      :initial="editInitial"
      :saving="shelvesStore.saving"
      :error="editError"
      @submit="onSubmitEdit"
    />

    <Dialog
      v-model:visible="pickerVisible"
      :modal="true"
      :closable="!shelvesStore.saving"
      :style="{ width: '460px' }"
      header="Assegna libro a questo slot"
      @hide="closePicker"
    >
      <div class="picker">
        <Message
          v-if="pickerError"
          severity="error"
          :closable="false"
        >
          {{ pickerError }}
        </Message>
        <p class="picker__pos" v-if="pickerSlot">
          Posizione: <strong>Mensola {{ pickerSlot.row + 1 }}, slot {{ pickerSlot.slot + 1 }}</strong>
        </p>
        <label class="picker__label" for="picker-book">Libro</label>
        <Select
          id="picker-book"
          v-model="pickerBookId"
          :options="pickerOptions"
          option-label="label"
          option-value="value"
          filter
          placeholder="Seleziona un libro non posizionato"
          empty-message="Tutti i libri sono già posizionati"
          class="picker__select"
        />
      </div>
      <template #footer>
        <Button
          label="Annulla"
          severity="secondary"
          text
          :disabled="shelvesStore.saving"
          @click="closePicker"
        />
        <Button
          label="Assegna"
          icon="pi pi-check"
          :disabled="!pickerBookId"
          :loading="shelvesStore.saving"
          @click="confirmPicker"
        />
      </template>
    </Dialog>

    <ConfirmDialog />
  </section>
</template>

<style scoped>
.shelf-detail {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
.shelf-detail__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.shelf-detail__title-wrap {
  flex: 1;
  min-width: 0;
}
.shelf-detail__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.015em;
}
.shelf-detail__sub {
  margin: 0.125rem 0 0;
  color: var(--p-surface-500);
  font-size: 0.875rem;
}
.shelf-detail__actions {
  display: flex;
  gap: 0.5rem;
}
.shelf-detail__loading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.shelf-detail__layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 900px) {
  .shelf-detail__layout {
    grid-template-columns: 1fr;
  }
}
.shelf-detail__svg-card,
.shelf-detail__books {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 14px;
  padding: 1rem 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.shelf-detail__svg {
  background: var(--p-surface-50);
  border-radius: 10px;
  padding: 1rem;
  overflow: auto;
  max-height: 70vh;
}
.shelf-detail__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--p-surface-500);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.shelf-detail__books-title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.shelf-detail__book-link {
  background: none;
  border: 0;
  padding: 0;
  color: var(--p-primary-600);
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.shelf-detail__book-link:hover {
  text-decoration: underline;
}
.shelf-detail__book-link:focus-visible {
  outline: 2px solid var(--p-primary-500);
  outline-offset: 2px;
  border-radius: 2px;
}
.shelf-detail__pos {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--p-surface-600);
}
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.picker__pos {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-surface-700);
}
.picker__label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--p-surface-700);
}
.picker__select {
  width: 100%;
}
</style>

<style>
html.dark .shelf-detail__svg-card,
html.dark .shelf-detail__books {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .shelf-detail__svg {
  background: var(--p-surface-900);
}
html.dark .shelf-detail__hint,
html.dark .shelf-detail__pos {
  color: var(--p-surface-400);
}
html.dark .shelf-detail__book-link {
  color: var(--p-primary-300);
}
html.dark .picker__pos,
html.dark .picker__label {
  color: var(--p-surface-200);
}
</style>
