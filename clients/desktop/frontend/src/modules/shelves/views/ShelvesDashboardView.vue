<script setup lang="ts">
/**
 * ShelvesDashboardView — pagina /shelves.
 *
 * Mostra una griglia responsive di tutti gli scaffali. Ogni card mostra
 * percentuale di riempimento + SVG dello scaffale stesso. Da qui si
 * crea / modifica / elimina uno scaffale e si naviga al dettaglio.
 *
 * Carica i libri di tutti gli scaffali in parallelo al mount: per i
 * cataloghi tipici (≤30 scaffali, ≤200 libri ciascuno) la chiamata è
 * trascurabile; sopra questa soglia introdurremo lazy load via
 * Intersection Observer.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import { useShelvesStore } from '../store';
import type { Shelf, ShelfInput } from '../types';
import { shelfToInput } from '../types';
import ShelfCard from '../components/ShelfCard.vue';
import ShelfConfigDialog from '../components/ShelfConfigDialog.vue';

const store = useShelvesStore();
const router = useRouter();
const confirm = useConfirm();

const dialogVisible = ref(false);
const editTarget = ref<Shelf | null>(null);
const dialogInitial = ref<ShelfInput | null>(null);
const dialogError = ref<string | null>(null);

const shelves = computed(() => store.items);

async function refreshAll(): Promise<void> {
  await store.fetchList();
  // Carica i libri per ogni scaffale in parallelo.
  await Promise.all(
    shelves.value.map((s) => store.fetchBooks(s.id).catch(() => null)),
  );
}

onMounted(refreshAll);

// Quando la lista cambia (es. dopo una creazione), assicurati di avere
// la cache books per ogni nuovo id.
watch(
  () => shelves.value.map((s) => s.id).join('|'),
  async () => {
    await Promise.all(
      shelves.value
        .filter((s) => !store.currentBooks[s.id])
        .map((s) => store.fetchBooks(s.id).catch(() => null)),
    );
  },
);

function openCreate(): void {
  editTarget.value = null;
  dialogInitial.value = null;
  dialogError.value = null;
  dialogVisible.value = true;
}
function openEdit(shelf: Shelf): void {
  editTarget.value = shelf;
  dialogInitial.value = shelfToInput(shelf);
  dialogError.value = null;
  dialogVisible.value = true;
}
async function onSubmitDialog(input: ShelfInput): Promise<void> {
  dialogError.value = null;
  try {
    if (editTarget.value) {
      await store.update(editTarget.value.id, input);
    } else {
      await store.create(input);
    }
    dialogVisible.value = false;
  } catch (e) {
    dialogError.value = (e as Error).message;
  }
}
function onDelete(shelf: Shelf): void {
  const hasBooks = shelf.book_count > 0;
  confirm.require({
    header: 'Elimina scaffale',
    message: hasBooks
      ? `“${shelf.name}” contiene ${shelf.book_count} libri. Saranno rimossi i posizionamenti, ma i libri restano in libreria. Procedere?`
      : `Eliminare “${shelf.name}”?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Elimina',
    rejectLabel: 'Annulla',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await store.remove(shelf.id);
      } catch {
        /* errore già nello store */
      }
    },
  });
}
function onOpenShelf(id: string): void {
  router.push({ name: 'shelf-detail', params: { id } });
}
function onOpenBook(id: string): void {
  router.push({ name: 'book-detail', params: { id } });
}
function onPickSlot(payload: {
  shelfId: string;
  rowIndex: number;
  slotIndex: number;
}): void {
  // Dalla dashboard, il click su uno slot vuoto porta al dettaglio
  // scaffale: l'utente può scegliere lì il libro da assegnare.
  router.push({
    name: 'shelf-detail',
    params: { id: payload.shelfId },
    query: { row: String(payload.rowIndex), slot: String(payload.slotIndex) },
  });
}
</script>

<template>
  <section class="shelves" aria-labelledby="shelves-title">
    <header class="shelves__header">
      <div>
        <h1 id="shelves-title" class="shelves__title">Scaffali</h1>
        <p class="shelves__sub">
          Visualizza e organizza la tua libreria fisica con scaffali interattivi.
        </p>
      </div>
      <Button
        label="Nuovo scaffale"
        icon="pi pi-plus"
        @click="openCreate"
      />
    </header>

    <Message
      v-if="store.error"
      severity="error"
      :closable="false"
      class="shelves__alert"
    >
      {{ store.error }}
    </Message>

    <div v-if="store.loadingList && shelves.length === 0" class="shelves__skeletons">
      <Skeleton v-for="n in 4" :key="n" height="280px" border-radius="14px" />
    </div>

    <div v-else-if="store.isEmpty" class="shelves__empty">
      <i class="pi pi-th-large shelves__empty-icon" aria-hidden="true" />
      <h2 class="shelves__empty-title">Non hai ancora scaffali</h2>
      <p class="shelves__empty-sub">
        Crea il tuo primo scaffale per iniziare a organizzare i libri visivamente.
      </p>
      <Button
        label="Crea scaffale"
        icon="pi pi-plus"
        @click="openCreate"
      />
    </div>

    <div v-else class="shelves__grid">
      <ShelfCard
        v-for="shelf in shelves"
        :key="shelf.id"
        :shelf="shelf"
        :books="store.booksFor(shelf.id)"
        @open-shelf="onOpenShelf"
        @open-book="onOpenBook"
        @pick-slot="onPickSlot"
        @edit="openEdit"
        @delete="onDelete"
      />
    </div>

    <ShelfConfigDialog
      v-model:visible="dialogVisible"
      :initial="dialogInitial"
      :saving="store.saving"
      :error="dialogError"
      @submit="onSubmitDialog"
    />
    <ConfirmDialog />
  </section>
</template>

<style scoped>
.shelves {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
.shelves__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.shelves__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.875rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.015em;
}
.shelves__sub {
  margin: 0.125rem 0 0;
  color: var(--p-surface-500);
  font-size: 0.9rem;
}
.shelves__alert {
  margin: 0;
}
.shelves__skeletons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}
.shelves__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1rem;
}
.shelves__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 4rem 1.5rem;
  background: var(--p-surface-50);
  border: 1px dashed var(--p-surface-300);
  border-radius: 16px;
  gap: 0.5rem;
}
.shelves__empty-icon {
  font-size: 3rem;
  color: var(--p-primary-500);
  margin-bottom: 0.75rem;
}
.shelves__empty-title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0;
  color: var(--p-surface-900);
}
.shelves__empty-sub {
  color: var(--p-surface-600);
  margin: 0 0 1rem;
  max-width: 420px;
}
</style>

<style>
html.dark .shelves__empty {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .shelves__empty-title {
  color: var(--p-surface-50);
}
html.dark .shelves__empty-sub {
  color: var(--p-surface-300);
}
</style>
