<script setup lang="ts">
/**
 * BookListTable — vista tabellare densa (alternativa a BookGrid).
 * Usa PrimeVue DataTable con paginatore lato-client (200 righe max).
 *
 * Estesa con:
 *  - Selezione multipla via checkbox (v-model:selection upstream).
 *  - Colonna "#" col numero progressivo (sortable).
 *  - Azione per riga: pulsante "Sposta" che emette `move(book)` —
 *    il parent apre MoveToShelfDialog con il singolo book id.
 *
 * NB: PrimeVue 4 richiede `dataKey` per la selezione multipla persistente
 *     attraverso la paginazione.
 */
import { useRouter } from 'vue-router';
import DataTable, { type DataTableRowClickEvent } from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import type { Book } from '../types';

const props = defineProps<{
  books: Book[];
  /** Selezione corrente; v-model dal parent. */
  selection?: Book[];
}>();
const emit = defineEmits<{
  (e: 'update:selection', v: Book[]): void;
  /** Click "Sposta" su una singola riga. */
  (e: 'move', book: Book): void;
}>();

const router = useRouter();

function open(b: Book): void {
  void router.push({ name: 'book-detail', params: { id: b.id } });
}

/**
 * `row-click` viene emesso anche quando l'utente clicca sulla checkbox
 * o sul pulsante azione: lo intercettiamo per evitare la navigazione
 * accidentale. PrimeVue offre `originalEvent` per ispezionare il target.
 */
function onRowClick(e: DataTableRowClickEvent): void {
  const target = e.originalEvent?.target as HTMLElement | undefined;
  if (!target) return;
  if (
    target.closest('.p-checkbox') ||
    target.closest('.p-button') ||
    target.closest('button') ||
    target.closest('input')
  ) {
    return;
  }
  open(e.data as Book);
}
</script>

<template>
  <DataTable
    :value="books"
    data-key="id"
    striped-rows
    :rows="25"
    paginator
    :pt="{ table: { class: 'book-table' } }"
    :selection="props.selection ?? []"
    @update:selection="(v) => emit('update:selection', v as Book[])"
    selection-mode="multiple"
    :meta-key-selection="false"
    @row-click="onRowClick"
  >
    <Column selection-mode="multiple" header-style="width: 3rem" />
    <Column field="progressive_number" header="#" sortable style="width: 5.5rem">
      <template #body="{ data }">
        <span
          v-if="(data as Book).progressive_number != null"
          class="book-table__progressive"
        >
          #{{ (data as Book).progressive_number }}
        </span>
        <span v-else class="book-table__progressive book-table__progressive--empty">—</span>
      </template>
    </Column>
    <Column field="title" header="Titolo" sortable>
      <template #body="{ data }">
        <div class="book-table__title-cell">
          <span class="book-table__title">{{ (data as Book).title }}</span>
          <span v-if="(data as Book).subtitle" class="book-table__subtitle">
            {{ (data as Book).subtitle }}
          </span>
        </div>
      </template>
    </Column>
    <Column header="Autori">
      <template #body="{ data }">
        {{ (data as Book).authors.join(', ') || '—' }}
      </template>
    </Column>
    <Column field="published_year" header="Anno" sortable style="width: 7rem" />
    <Column field="format" header="Formato" sortable style="width: 9rem">
      <template #body="{ data }">
        <span class="book-table__chip">{{ (data as Book).format || '—' }}</span>
      </template>
    </Column>
    <Column header="" style="width: 4rem" :pt="{ bodyCell: { class: 'book-table__action-cell' } }">
      <template #body="{ data }">
        <Button
          icon="pi pi-bookmark"
          text
          rounded
          size="small"
          aria-label="Sposta su scaffale"
          title="Sposta su scaffale"
          @click.stop="emit('move', data as Book)"
        />
      </template>
    </Column>
  </DataTable>
</template>

<style scoped>
.book-table__title-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.book-table__title {
  font-weight: 600;
}
.book-table__subtitle {
  font-size: 0.8rem;
  color: var(--p-surface-500);
}
.book-table__chip {
  text-transform: capitalize;
  color: var(--p-surface-700);
}
.book-table__progressive {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--p-primary-700);
}
.book-table__progressive--empty {
  color: var(--p-surface-400);
  font-weight: 400;
}
:deep(.book-table__action-cell) {
  text-align: right;
}
</style>

<style>
html.dark .book-table__chip {
  color: var(--p-surface-300);
}
html.dark .book-table__progressive {
  color: var(--p-primary-300);
}
html.dark .book-table__progressive--empty {
  color: var(--p-surface-500);
}
</style>
