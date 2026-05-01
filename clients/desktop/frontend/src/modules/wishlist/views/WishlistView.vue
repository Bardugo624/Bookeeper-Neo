<script setup lang="ts">
/**
 * WishlistView — orchestratore del modulo wishlist.
 *
 * Layout: header → quick-add bar → filtri (priorità + ricerca) → griglia
 * di card. Pattern identico a ShelvesDashboardView per coerenza visuale.
 *
 * UX: due path di add — quick-add inline (titolo + isbn + priorità) per
 * inserimenti rapidi, dialog completo per metadati ricchi (autori, link,
 * note). Convert promuove la voce a libro reale e naviga al dettaglio.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';

import { useWishlistStore } from '../store';
import {
  EMPTY_WISHLIST_INPUT,
  WISHLIST_PRIORITIES,
  wishlistToInput,
  type WishlistInput,
  type WishlistItem,
} from '../types';
import WishlistQuickAdd from '../components/WishlistQuickAdd.vue';
import WishlistItemCard from '../components/WishlistItemCard.vue';
import WishlistEditDialog from '../components/WishlistEditDialog.vue';

const store = useWishlistStore();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();

const quickAdd = ref<InstanceType<typeof WishlistQuickAdd> | null>(null);

const dialogVisible = ref(false);
const editTarget = ref<WishlistItem | null>(null);
const dialogInitial = ref<WishlistInput | null>(null);
const dialogError = ref<string | null>(null);

// Filtri locali (no round-trip server: lista wishlist tipica < 100 voci).
const filterPriority = ref<number | null>(null);
const filterText = ref('');

const filterPriorityOptions = [
  { value: null, label: 'Tutte le priorità' },
  ...WISHLIST_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
];

const filteredItems = computed<WishlistItem[]>(() => {
  const txt = filterText.value.trim().toLowerCase();
  return store.items.filter((it) => {
    if (filterPriority.value !== null && it.priority !== filterPriority.value) {
      return false;
    }
    if (!txt) return true;
    const haystack = [
      it.title,
      it.authors ?? '',
      it.isbn ?? '',
      it.notes ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(txt);
  });
});

const hasActiveFilters = computed(
  () => filterPriority.value !== null || filterText.value.trim().length > 0,
);

onMounted(async () => {
  try {
    await store.fetchList();
  } catch {
    /* error in store */
  }
});

async function onQuickAdd(input: WishlistInput): Promise<void> {
  try {
    await store.create(input);
    toast.add({
      severity: 'success',
      summary: 'Aggiunta alla wishlist',
      detail: input.title,
      life: 2500,
    });
    await quickAdd.value?.reset();
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Errore',
      detail: (e as Error).message,
      life: 4500,
    });
  }
}

function openCreate(): void {
  editTarget.value = null;
  dialogInitial.value = { ...EMPTY_WISHLIST_INPUT };
  dialogError.value = null;
  dialogVisible.value = true;
}

function openEdit(item: WishlistItem): void {
  editTarget.value = item;
  dialogInitial.value = wishlistToInput(item);
  dialogError.value = null;
  dialogVisible.value = true;
}

async function onSubmitDialog(input: WishlistInput): Promise<void> {
  dialogError.value = null;
  try {
    if (editTarget.value) {
      await store.update(editTarget.value.id, input);
      toast.add({
        severity: 'success',
        summary: 'Voce aggiornata',
        detail: input.title,
        life: 2500,
      });
    } else {
      await store.create(input);
      toast.add({
        severity: 'success',
        summary: 'Aggiunta alla wishlist',
        detail: input.title,
        life: 2500,
      });
    }
    dialogVisible.value = false;
  } catch (e) {
    dialogError.value = (e as Error).message;
  }
}

function onDelete(item: WishlistItem): void {
  confirm.require({
    header: 'Elimina dalla wishlist',
    message: `Eliminare "${item.title}"? L'azione è irreversibile.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Elimina',
    rejectLabel: 'Annulla',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await store.remove(item.id);
        toast.add({
          severity: 'info',
          summary: 'Voce eliminata',
          detail: item.title,
          life: 2500,
        });
      } catch (e) {
        toast.add({
          severity: 'error',
          summary: 'Errore',
          detail: (e as Error).message,
          life: 4500,
        });
      }
    },
  });
}

function onConvert(item: WishlistItem): void {
  confirm.require({
    header: 'Aggiungi alla libreria',
    message: `Promuovi "${item.title}" da wishlist a libro nella tua libreria? La voce verrà rimossa dalla wishlist.`,
    icon: 'pi pi-check-circle',
    acceptLabel: 'Aggiungi',
    rejectLabel: 'Annulla',
    accept: async () => {
      try {
        const bookId = await store.convert(item.id);
        toast.add({
          severity: 'success',
          summary: 'Aggiunto alla libreria',
          detail: item.title,
          life: 3000,
        });
        // UX: lascia che il toast sia visibile prima della navigazione.
        setTimeout(() => {
          router.push({ name: 'book-detail', params: { id: bookId } });
        }, 300);
      } catch (e) {
        toast.add({
          severity: 'error',
          summary: 'Errore conversione',
          detail: (e as Error).message,
          life: 4500,
        });
      }
    },
  });
}

function clearFilters(): void {
  filterPriority.value = null;
  filterText.value = '';
}
</script>

<template>
  <section class="wlist" aria-labelledby="wlist-title">
    <header class="wlist__header">
      <div>
        <h1 id="wlist-title" class="wlist__title">Wishlist</h1>
        <p class="wlist__sub">
          Libri che vuoi leggere o regalare. Aggiungili al volo e promuovili in
          libreria quando li acquisti.
        </p>
      </div>
      <div class="wlist__head-actions">
        <Button
          label="Nuova voce"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          @click="openCreate"
        />
      </div>
    </header>

    <Message
      v-if="store.error"
      severity="error"
      :closable="false"
      class="wlist__alert"
    >
      {{ store.error }}
    </Message>

    <WishlistQuickAdd
      ref="quickAdd"
      :saving="store.saving"
      @submit="onQuickAdd"
    />

    <div
      v-if="store.items.length > 0 || hasActiveFilters"
      class="wlist__filters"
    >
      <span class="wlist__count">
        <i class="pi pi-heart-fill" aria-hidden="true" />
        {{ store.items.length }}
        {{ store.items.length === 1 ? 'voce' : 'voci' }}
        <span v-if="filteredItems.length !== store.items.length">
          · {{ filteredItems.length }} mostrate
        </span>
      </span>
      <div class="wlist__filter-controls">
        <Select
          v-model="filterPriority"
          :options="filterPriorityOptions"
          option-label="label"
          option-value="value"
          class="wlist__filter-select"
        />
        <span class="p-input-icon-left wlist__search">
          <i class="pi pi-search" />
          <InputText
            v-model="filterText"
            placeholder="Cerca titolo, autore, ISBN…"
          />
        </span>
        <Button
          v-if="hasActiveFilters"
          icon="pi pi-times"
          severity="secondary"
          text
          aria-label="Azzera filtri"
          @click="clearFilters"
        />
      </div>
    </div>

    <div
      v-if="store.loadingList && store.items.length === 0"
      class="wlist__skeletons"
    >
      <Skeleton v-for="n in 4" :key="n" height="220px" border-radius="12px" />
    </div>

    <div v-else-if="store.isEmpty" class="wlist__empty">
      <i class="pi pi-heart wlist__empty-icon" aria-hidden="true" />
      <h2 class="wlist__empty-title">La tua wishlist è vuota</h2>
      <p class="wlist__empty-sub">
        Inizia ad aggiungere libri che vorresti leggere o regalare. Usa la barra
        sopra per un add rapido, o "Nuova voce" per inserire link e note.
      </p>
    </div>

    <div
      v-else-if="filteredItems.length === 0"
      class="wlist__empty wlist__empty--filter"
    >
      <i class="pi pi-filter-slash wlist__empty-icon" aria-hidden="true" />
      <h2 class="wlist__empty-title">Nessuna voce corrisponde ai filtri</h2>
      <p class="wlist__empty-sub">Modifica priorità o ricerca per vedere altre voci.</p>
      <Button
        label="Azzera filtri"
        icon="pi pi-times"
        severity="secondary"
        outlined
        @click="clearFilters"
      />
    </div>

    <div v-else class="wlist__grid">
      <WishlistItemCard
        v-for="item in filteredItems"
        :key="item.id"
        :item="item"
        :converting="store.converting"
        @edit="openEdit"
        @delete="onDelete"
        @convert="onConvert"
      />
    </div>

    <WishlistEditDialog
      v-model:visible="dialogVisible"
      :initial="dialogInitial"
      :saving="store.saving"
      :error="dialogError"
      @submit="onSubmitDialog"
    />
    <ConfirmDialog />
    <Toast position="bottom-right" />
  </section>
</template>

<style scoped>
.wlist {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
.wlist__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.wlist__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.875rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.015em;
}
.wlist__sub {
  margin: 0.125rem 0 0;
  color: var(--p-surface-500);
  font-size: 0.9rem;
  max-width: 620px;
}
.wlist__head-actions {
  display: flex;
  gap: 0.5rem;
}
.wlist__alert {
  margin: 0;
}
.wlist__filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.25rem 0;
  border-top: 1px dashed var(--p-surface-200);
}
.wlist__count {
  font-size: 0.85rem;
  color: var(--p-surface-600);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.wlist__count .pi-heart-fill {
  color: var(--p-primary-500);
}
.wlist__filter-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.wlist__filter-select {
  min-width: 180px;
}
.wlist__search {
  position: relative;
}
.wlist__search :deep(input) {
  padding-left: 2.25rem;
  min-width: 240px;
}
.wlist__skeletons,
.wlist__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}
.wlist__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3.5rem 1.5rem;
  background: var(--p-surface-50);
  border: 1px dashed var(--p-surface-300);
  border-radius: 16px;
  gap: 0.5rem;
}
.wlist__empty-icon {
  font-size: 2.5rem;
  color: var(--p-primary-500);
  margin-bottom: 0.5rem;
}
.wlist__empty-title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.3rem;
  font-weight: 600;
  margin: 0;
  color: var(--p-surface-900);
}
.wlist__empty-sub {
  color: var(--p-surface-600);
  margin: 0 0 0.5rem;
  max-width: 480px;
  line-height: 1.5;
}
@media (max-width: 640px) {
  .wlist {
    padding: 1rem;
  }
  .wlist__filter-controls {
    width: 100%;
  }
  .wlist__filter-select,
  .wlist__search :deep(input) {
    flex: 1;
    min-width: 0;
    width: 100%;
  }
}
</style>

<!-- Vedi BooksListView per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .wlist__sub {
  color: var(--p-surface-400);
}
html.dark .wlist__filters {
  border-top-color: var(--p-surface-700);
}
html.dark .wlist__count {
  color: var(--p-surface-300);
}
html.dark .wlist__empty {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .wlist__empty-title {
  color: var(--p-surface-50);
}
html.dark .wlist__empty-sub {
  color: var(--p-surface-300);
}
</style>
