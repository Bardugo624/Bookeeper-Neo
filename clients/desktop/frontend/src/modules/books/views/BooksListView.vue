<script setup lang="ts">
/**
 * BooksListView — schermata principale del modulo.
 *
 * Layout (top → bottom):
 *   1. Toolbar: search + view toggle (grid/table) + bottone "Nuovo libro"
 *   2. Stato: skeleton (loading) | empty state | grid/table
 *
 * La ricerca FTS è debounced via useBookSearch.
 */
import { onMounted, ref } from 'vue';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import Skeleton from 'primevue/skeleton';
import { useBooksStore } from '../store';
import { useBookSearch } from '../composables/useBookSearch';
import BookGrid from '../components/BookGrid.vue';
import BookListTable from '../components/BookListTable.vue';
import BookCreateDialog from '../components/BookCreateDialog.vue';

const store = useBooksStore();
const { input, isPending, clear } = useBookSearch();

const viewMode = ref<'grid' | 'table'>('grid');
const viewOptions = [
  { label: '', value: 'grid', icon: 'pi pi-th-large' },
  { label: '', value: 'table', icon: 'pi pi-list' },
];

const showCreate = ref(false);

onMounted(() => {
  if (store.items.length === 0) void store.fetchList();
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
        </p>
      </div>
      <Button
        icon="pi pi-plus"
        label="Nuovo libro"
        severity="primary"
        @click="showCreate = true"
      />
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
    <BookListTable v-else :books="store.items" />

    <BookCreateDialog v-model:visible="showCreate" @created="() => store.fetchList()" />
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
</style>
