<script setup lang="ts">
/**
 * BooksListView — schermata principale del modulo.
 *
 * Layout (top → bottom):
 *   1. Toolbar: search + view toggle (grid/table) + bottone "Nuovo libro"
 *   2. Toolbar batch (visibile solo se selection.length > 0 in modalita' tabella)
 *   3. Stato: skeleton (loading) | empty state | grid/table
 *
 * La ricerca FTS è debounced via useBookSearch.
 *
 * Selezione: e' significativa solo in vista tabella; quando l'utente
 * commuta a grid resettiamo per evitare azioni "fantasma".
 */
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import Skeleton from 'primevue/skeleton';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useBooksStore } from '../store';
import { useBookSearch } from '../composables/useBookSearch';
import BookGrid from '../components/BookGrid.vue';
import BookListTable from '../components/BookListTable.vue';
import BookCreateDialog from '../components/BookCreateDialog.vue';
import MoveToShelfDialog from '../components/MoveToShelfDialog.vue';
import type { Book } from '../types';

const store = useBooksStore();
const { input, isPending, clear } = useBookSearch();
const confirm = useConfirm();
const toast = useToast();

const viewMode = ref<'grid' | 'table'>('grid');
const viewOptions = [
  { label: '', value: 'grid', icon: 'pi pi-th-large' },
  { label: '', value: 'table', icon: 'pi pi-list' },
];

const showCreate = ref(false);
const selection = ref<Book[]>([]);
const showMoveDialog = ref(false);
/**
 * I book id da spostare: deriva da `selection` per il batch toolbar oppure
 * dal singolo click "sposta" su una riga (rowMoveTarget). Tenere stati
 * separati permette di non perdere la selezione quando si sposta una
 * singola riga fuori dalla selezione attiva.
 */
const rowMoveTarget = ref<Book | null>(null);
const moveTargetIds = computed<string[]>(() =>
  rowMoveTarget.value ? [rowMoveTarget.value.id] : selection.value.map((b) => b.id),
);

watch(viewMode, (m) => {
  if (m !== 'table') selection.value = [];
});

function openSingleMove(book: Book): void {
  rowMoveTarget.value = book;
  showMoveDialog.value = true;
}

function openBatchMove(): void {
  rowMoveTarget.value = null;
  showMoveDialog.value = true;
}

function onAssigned(p: { placed: number; skippedAlreadyPlaced: number; skippedNoSpace: number }): void {
  const parts: string[] = [];
  if (p.placed > 0) parts.push(`${p.placed} libri spostati`);
  if (p.skippedAlreadyPlaced > 0)
    parts.push(`${p.skippedAlreadyPlaced} già su altri scaffali`);
  if (p.skippedNoSpace > 0) parts.push(`${p.skippedNoSpace} senza spazio`);
  toast.add({
    severity: p.placed > 0 ? 'success' : 'warn',
    summary: p.placed > 0 ? 'Operazione completata' : 'Nessun libro spostato',
    detail: parts.join(' · ') || 'Nessuna modifica effettuata.',
    life: 4000,
  });
  // Se l'azione era batch (no rowMoveTarget) puliamo la selezione.
  if (!rowMoveTarget.value) selection.value = [];
  rowMoveTarget.value = null;
}

function onBatchDelete(): void {
  const count = selection.value.length;
  if (count === 0) return;
  confirm.require({
    header: 'Conferma cancellazione',
    message: `Eliminare definitivamente ${count} ${count === 1 ? 'libro' : 'libri'}? L'operazione non è reversibile.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Elimina',
    rejectLabel: 'Annulla',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      try {
        const ids = selection.value.map((b) => b.id);
        const deleted = await store.batchDelete(ids);
        toast.add({
          severity: 'success',
          summary: 'Eliminazione completata',
          detail: `${deleted} ${deleted === 1 ? 'libro eliminato' : 'libri eliminati'}.`,
          life: 3500,
        });
        selection.value = [];
      } catch (e) {
        toast.add({
          severity: 'error',
          summary: 'Errore',
          detail: (e as Error).message,
          life: 5000,
        });
      }
    },
  });
}

function onPlacementWarning(message: string): void {
  toast.add({ severity: 'warn', summary: 'Attenzione', detail: message, life: 5000 });
}

// Polling ogni 30s mentre la libreria e' in primo piano: cattura
// modifiche fatte da mobile / altri client senza richiedere F5 e
// senza dipendere solo dagli eventi di focus (che non scattano
// quando la finestra ha gia' il focus e l'utente e' attivo qui).
const POLL_INTERVAL_MS = 30_000;
let pollTimer: number | undefined;
const lastSyncAt = ref<number>(0);
const route = useRoute();

/** Refresh background-friendly: skippa se gia' in corso o offline. */
function syncList(): void {
  if (store.loadingList) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  void store.fetchList().then(() => {
    lastSyncAt.value = Date.now();
  }).catch(() => {
    // Errori gia' propagati nello store.error; evitiamo doppi toast qui.
  });
}

/** Sync esplicito (pulsante toolbar): mostra feedback immediato. */
async function manualSync(): Promise<void> {
  if (store.loadingList) return;
  try {
    await store.fetchList();
    lastSyncAt.value = Date.now();
    toast.add({
      severity: 'success',
      summary: 'Libreria aggiornata',
      detail: `${store.items.length} ${store.items.length === 1 ? 'libro sincronizzato' : 'libri sincronizzati'}.`,
      life: 2500,
    });
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Sincronizzazione fallita',
      detail: (e as Error).message,
      life: 4000,
    });
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') syncList();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

onMounted(() => {
  // Mount = utente e' arrivato sulla libreria (anche cambiando tab
  // dalla sidebar): sync immediato in background, mostra skeleton
  // solo se non abbiamo ancora nulla da mostrare.
  syncList();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onWindowFocus);
  startPolling();
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onWindowFocus);
  stopPolling();
});

// Cambio tab nella sidebar (route /books raggiunta da altra pagina
// senza unmount, es. <KeepAlive>): forziamo un sync.
watch(
  () => route.fullPath,
  (p) => { if (p.startsWith('/books')) syncList(); },
);

/**
 * Sincronizzazione lazy: quando la finestra torna visibile/in focus,
 * rifacciamo il fetch della lista per riflettere modifiche fatte da
 * un altro client (mobile o secondo desktop) senza richiedere F5.
 * Skippiamo se gia' in caricamento per evitare doppioni.
 */
function onVisibility(): void {
  if (document.visibilityState === 'visible') syncList();
}

function onWindowFocus(): void {
  syncList();
}

/** Etichetta "ultimo sync" relativa, aggiornata via nowTick ogni 30s. */
const nowTick = ref(Date.now());
let labelTimer: number | undefined;
const lastSyncLabel = computed<string>(() => {
  const now = nowTick.value; // dipendenza esplicita per ricalcolo
  if (lastSyncAt.value === 0) return '';
  const diffSec = Math.max(0, Math.round((now - lastSyncAt.value) / 1000));
  if (diffSec < 10) return 'aggiornata adesso';
  if (diffSec < 60) return `aggiornata ${diffSec}s fa`;
  const m = Math.round(diffSec / 60);
  if (m < 60) return `aggiornata ${m} min fa`;
  const h = Math.round(m / 60);
  return `aggiornata ${h}h fa`;
});
onMounted(() => {
  labelTimer = window.setInterval(() => { nowTick.value = Date.now(); }, 30_000);
});
onBeforeUnmount(() => {
  if (labelTimer !== undefined) window.clearInterval(labelTimer);
});
</script>

<template>
  <section class="books" aria-labelledby="books-title">
    <header class="books__header">
      <div>
        <h1 id="books-title" class="books__title">Libreria</h1>
        <p class="books__sub">
          {{ store.items.length }} {{ store.items.length === 1 ? 'libro' : 'libri' }}
          <span v-if="store.isSearching"> (filtrati)</span>
          <span v-if="lastSyncLabel" class="books__sync-label"> · {{ lastSyncLabel }}</span>
        </p>
      </div>
      <div class="books__header-actions">
        <Button
          icon="pi pi-sync"
          severity="secondary"
          outlined
          aria-label="Sincronizza libreria"
          title="Sincronizza con il server"
          :loading="store.loadingList"
          @click="manualSync"
        />
        <Button
          icon="pi pi-plus"
          label="Nuovo libro"
          severity="primary"
          @click="showCreate = true"
        />
      </div>
    </header>

    <div class="books__toolbar">
      <IconField class="books__search">
        <InputIcon :class="isPending ? 'pi pi-spin pi-spinner' : 'pi pi-search'" />
        <InputText
          v-model="input"
          placeholder="Cerca per titolo, autore, ISBN…"
          :pt="{ root: { 'aria-label': 'Cerca nella libreria' } }"
        />
      </IconField>
      <Button
        v-if="input"
        icon="pi pi-times"
        text
        severity="secondary"
        aria-label="Cancella ricerca"
        @click="clear"
      />
      <SelectButton
        v-model="viewMode"
        :options="viewOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-label="Modalità di visualizzazione"
      >
        <template #option="{ option }">
          <i :class="option.icon" :aria-label="option.value === 'grid' ? 'Griglia' : 'Tabella'"></i>
        </template>
      </SelectButton>
    </div>

    <div v-if="store.loadingList && store.items.length === 0" class="books__skeletons">
      <Skeleton v-for="i in 6" :key="i" height="168px" border-radius="12px" />
    </div>

    <div v-else-if="store.error" class="books__error" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <div>
        <strong>Impossibile caricare la libreria.</strong>
        <p>{{ store.error }}</p>
      </div>
      <Button label="Riprova" icon="pi pi-refresh" severity="secondary" @click="store.fetchList()" />
    </div>

    <div v-else-if="store.isEmpty" class="books__empty">
      <i class="pi pi-book books__empty-icon" aria-hidden="true"></i>
      <h2 v-if="store.isSearching" class="books__empty-title">Nessun risultato</h2>
      <h2 v-else class="books__empty-title">La tua libreria è vuota</h2>
      <p class="books__empty-sub">
        <template v-if="store.isSearching">
          Prova un altro termine o cancella la ricerca.
        </template>
        <template v-else>
          Aggiungi il primo libro per iniziare a costruire il tuo catalogo.
        </template>
      </p>
      <Button
        v-if="!store.isSearching"
        icon="pi pi-plus"
        label="Aggiungi libro"
        @click="showCreate = true"
      />
    </div>

    <BookGrid v-else-if="viewMode === 'grid'" :books="store.items" />
    <BookListTable
      v-else
      :books="store.items"
      v-model:selection="selection"
      @move="openSingleMove"
    />

    <Transition name="batch-toolbar">
      <div
        v-if="viewMode === 'table' && selection.length > 0"
        class="books__batch"
        role="toolbar"
        :aria-label="`${selection.length} libri selezionati\u2014azioni batch`"
      >
        <span class="books__batch-count">
          <i class="pi pi-check-circle" aria-hidden="true" />
          {{ selection.length }} {{ selection.length === 1 ? 'selezionato' : 'selezionati' }}
        </span>
        <div class="books__batch-actions">
          <Button
            label="Sposta su scaffale"
            icon="pi pi-bookmark"
            severity="secondary"
            @click="openBatchMove"
          />
          <Button
            label="Elimina"
            icon="pi pi-trash"
            severity="danger"
            outlined
            :loading="store.deleting"
            @click="onBatchDelete"
          />
          <Button
            icon="pi pi-times"
            text
            severity="secondary"
            aria-label="Annulla selezione"
            @click="selection = []"
          />
        </div>
      </div>
    </Transition>

    <BookCreateDialog
      v-model:visible="showCreate"
      @created="() => store.fetchList()"
      @placement-warning="onPlacementWarning"
    />
    <MoveToShelfDialog
      v-model:visible="showMoveDialog"
      :book-ids="moveTargetIds"
      @assigned="onAssigned"
    />
  </section>
</template>

<style scoped>
.books {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
.books__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.books__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.875rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.015em;
}
.books__sub {
  margin: 0.125rem 0 0;
  color: var(--p-surface-500);
  font-size: 0.9rem;
}
.books__sync-label {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}
.books__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.books__toolbar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}
.books__search {
  flex: 1 1 280px;
  max-width: 480px;
}
.books__search :deep(input) {
  width: 100%;
}
.books__skeletons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}
.books__error {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--p-red-500, #dc2626) 10%, transparent);
  color: var(--p-red-700, #b91c1c);
}
.books__error i {
  font-size: 1.4rem;
}
.books__error p {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  opacity: 0.85;
}
.books__empty {
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
.books__empty-icon {
  font-size: 3rem;
  color: var(--p-primary-500);
  margin-bottom: 0.75rem;
}
.books__empty-title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0;
  color: var(--p-surface-900);
}
.books__empty-sub {
  color: var(--p-surface-600);
  margin: 0 0 1rem;
  max-width: 360px;
}

/* --- Batch toolbar (sticky bottom-center) --- */
.books__batch {
  position: sticky;
  bottom: 1rem;
  align-self: center;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 0.75rem 0.625rem 1rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 999px;
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.06);
  z-index: 5;
  max-width: min(680px, 100%);
}
.books__batch-count {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-primary-700);
  white-space: nowrap;
}
.books__batch-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.batch-toolbar-enter-active,
.batch-toolbar-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.batch-toolbar-enter-from,
.batch-toolbar-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .batch-toolbar-enter-active,
  .batch-toolbar-leave-active {
    transition: none;
  }
}
@media (max-width: 640px) {
  .books__batch {
    flex-direction: column;
    align-items: stretch;
    border-radius: 14px;
    bottom: 0.5rem;
  }
}
</style>

<!--
  Override dark mode in <style> NON-scoped: il compiler Vue scoped CSS
  scarta il selettore figlio quando si scrive `:global(html.dark) .x`,
  generando solo `html.dark { … }`. Spostando le regole dark in un blocco
  globale evitiamo il bug ed è meno chirurgico ma più affidabile.
-->
<style>
html.dark .books__empty {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .books__empty-title {
  color: var(--p-surface-50);
}
html.dark .books__empty-sub {
  color: var(--p-surface-300);
}
html.dark .books__batch {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
}
html.dark .books__batch-count {
  color: var(--p-primary-300);
}
</style>
