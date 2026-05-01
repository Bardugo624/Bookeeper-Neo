<script setup lang="ts">
/**
 * BookListTable — vista tabellare densa (alternativa a BookGrid).
 * Usa PrimeVue DataTable con paginatore lato-client (200 righe max).
 */
import { useRouter } from 'vue-router';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import type { Book } from '../types';

defineProps<{ books: Book[] }>();

const router = useRouter();

function open(b: Book): void {
  void router.push({ name: 'book-detail', params: { id: b.id } });
}
</script>

<template>
  <DataTable
    :value="books"
    striped-rows
    :rows="25"
    paginator
    :pt="{ table: { class: 'book-table' } }"
    selection-mode="single"
    @row-click="(e) => open(e.data as Book)"
  >
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
</style>

<style>
html.dark .book-table__chip {
  color: var(--p-surface-300);
}
</style>
