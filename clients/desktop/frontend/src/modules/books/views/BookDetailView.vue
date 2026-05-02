<script setup lang="ts">
/**
 * BookDetailView — pagina di dettaglio del singolo libro.
 * Mostra copertina + metadati estesi + descrizione + note. Azioni:
 * "Modifica" (route edit), "Elimina" (ConfirmDialog).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import { useConfirm } from 'primevue/useconfirm';
import ConfirmDialog from 'primevue/confirmdialog';
import { useBooksStore } from '../store';
import BookCover from '../components/BookCover.vue';
import AssignBookDialog from '@/modules/shelves/components/AssignBookDialog.vue';
import { useShelvesStore } from '@/modules/shelves/store';
import type { ShelfBook } from '@/modules/shelves/types';

const props = defineProps<{ id: string }>();

const store = useBooksStore();
const shelvesStore = useShelvesStore();
const router = useRouter();
const confirm = useConfirm();

const assignVisible = ref(false);

async function load(): Promise<void> {
  try {
    await store.fetchOne(props.id);
  } catch {
    /* error state già nello store */
  }
  // Carica scaffali + libri di ciascuno per determinare la posizione
  // corrente (necessario per mostrare il pulsante "Rimuovi").
  try {
    if (shelvesStore.items.length === 0) await shelvesStore.fetchList();
    await Promise.all(
      shelvesStore.items.map((s) =>
        shelvesStore.fetchBooks(s.id).catch(() => null),
      ),
    );
  } catch {
    /* placement indicator opzionale */
  }
}

const placement = computed<ShelfBook | null>(() => {
  for (const list of Object.values(shelvesStore.currentBooks)) {
    const hit = list.find((b) => b.book_id === props.id);
    if (hit) return hit;
  }
  return null;
});
const placementShelf = computed(() =>
  placement.value
    ? shelvesStore.getById(placement.value.shelf_id) ?? null
    : null,
);

onMounted(load);
watch(() => props.id, load);

function onEdit(): void {
  void router.push({ name: 'book-edit', params: { id: props.id } });
}

function onDelete(): void {
  confirm.require({
    message: 'Sei sicuro di voler eliminare questo libro? L\'operazione è irreversibile.',
    header: 'Elimina libro',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Elimina',
    rejectLabel: 'Annulla',
    acceptProps: { severity: 'danger', icon: 'pi pi-trash' },
    rejectProps: { severity: 'secondary', text: true },
    accept: async () => {
      await store.remove(props.id);
      void router.replace({ name: 'books' });
    },
  });
}
</script>

<template>
  <section class="book-detail">
    <ConfirmDialog />

    <Button
      class="book-detail__back"
      icon="pi pi-arrow-left"
      label="Libreria"
      text
      severity="secondary"
      @click="router.push({ name: 'books' })"
    />

    <div v-if="store.loadingDetail && !store.current" class="book-detail__skeleton">
      <Skeleton width="180px" height="270px" border-radius="8px" />
      <div class="book-detail__skel-meta">
        <Skeleton width="60%" height="2rem" />
        <Skeleton width="40%" height="1.25rem" />
        <Skeleton width="80%" height="1rem" />
        <Skeleton width="100%" height="6rem" />
      </div>
    </div>

    <div v-else-if="store.error" class="book-detail__error" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <p>{{ store.error }}</p>
      <Button label="Riprova" severity="secondary" @click="load" />
    </div>

    <article v-else-if="store.current" class="book-detail__body">
      <BookCover
        :title="store.current.title"
        :path="store.current.cover_path"
        :isbn="store.current.isbn_13 || store.current.isbn_10"
        size="lg"
        class="book-detail__cover"
      />
      <div class="book-detail__meta">
        <h1 class="book-detail__title">{{ store.current.title }}</h1>
        <p v-if="store.current.subtitle" class="book-detail__subtitle">
          {{ store.current.subtitle }}
        </p>
        <p v-if="store.current.authors.length" class="book-detail__authors">
          di <strong>{{ store.current.authors.join(', ') }}</strong>
        </p>

        <dl class="book-detail__facts">
          <template v-if="store.current.publisher">
            <dt>Editore</dt>
            <dd>{{ store.current.publisher }}</dd>
          </template>
          <template v-if="store.current.published_year">
            <dt>Anno</dt>
            <dd>{{ store.current.published_year }}</dd>
          </template>
          <template v-if="store.current.format">
            <dt>Formato</dt>
            <dd class="book-detail__capitalize">{{ store.current.format }}</dd>
          </template>
          <template v-if="store.current.genre">
            <dt>Genere</dt>
            <dd>{{ store.current.genre }}</dd>
          </template>
          <template v-if="store.current.language">
            <dt>Lingua</dt>
            <dd>{{ store.current.language }}</dd>
          </template>
          <template v-if="store.current.page_count">
            <dt>Pagine</dt>
            <dd>{{ store.current.page_count }}</dd>
          </template>
          <template v-if="store.current.isbn_13">
            <dt>ISBN-13</dt>
            <dd>{{ store.current.isbn_13 }}</dd>
          </template>
          <template v-if="store.current.isbn_10">
            <dt>ISBN-10</dt>
            <dd>{{ store.current.isbn_10 }}</dd>
          </template>
        </dl>

        <section v-if="store.current.description" class="book-detail__section">
          <h2 class="book-detail__section-title">Descrizione</h2>
          <p>{{ store.current.description }}</p>
        </section>

        <section v-if="store.current.notes" class="book-detail__section">
          <h2 class="book-detail__section-title">Note personali</h2>
          <p>{{ store.current.notes }}</p>
        </section>

        <div class="book-detail__actions">
          <Button icon="pi pi-pencil" label="Modifica" @click="onEdit" />
          <Button
            icon="pi pi-th-large"
            :label="placement ? 'Cambia posizione' : 'Posiziona su scaffale'"
            severity="secondary"
            outlined
            @click="assignVisible = true"
          />
          <Button
            icon="pi pi-trash"
            label="Elimina"
            severity="danger"
            text
            :loading="store.deleting"
            @click="onDelete"
          />
        </div>

        <p v-if="placement && placementShelf" class="book-detail__placement">
          <i class="pi pi-map-marker" aria-hidden="true" />
          Su <router-link :to="{ name: 'shelf-detail', params: { id: placementShelf.id } }">
            {{ placementShelf.name }}
          </router-link>
          · Mensola {{ placement.row_index + 1 }}, slot {{ placement.slot_index + 1 }}
        </p>
      </div>
    </article>

    <AssignBookDialog
      v-if="store.current"
      v-model:visible="assignVisible"
      :book-id="store.current.id"
      :book-title="store.current.title"
      :current-placement="placement"
      @assigned="load"
    />
  </section>
</template>

<style scoped>
.book-detail {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.book-detail__back {
  align-self: flex-start;
}
.book-detail__skeleton,
.book-detail__body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2rem;
  align-items: flex-start;
}
.book-detail__skel-meta {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.book-detail__cover {
  width: 220px;
}
.book-detail__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 2rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.015em;
  line-height: 1.15;
}
.book-detail__subtitle {
  margin: 0.25rem 0 0;
  font-size: 1.1rem;
  color: var(--p-surface-600);
  font-style: italic;
}
.book-detail__authors {
  margin: 0.5rem 0 1.25rem;
  color: var(--p-surface-700);
}
.book-detail__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.4rem 1rem;
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
}
.book-detail__facts dt {
  color: var(--p-surface-500);
  font-weight: 500;
}
.book-detail__facts dd {
  margin: 0;
  color: var(--p-surface-800);
}
.book-detail__capitalize {
  text-transform: capitalize;
}
.book-detail__section {
  margin-top: 1.25rem;
}
.book-detail__section-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--p-surface-500);
  margin: 0 0 0.375rem;
}
.book-detail__section p {
  margin: 0;
  line-height: 1.55;
  white-space: pre-wrap;
}
.book-detail__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}
.book-detail__placement {
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  color: var(--p-surface-700);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.book-detail__placement a {
  color: var(--p-primary-600);
  text-decoration: none;
  font-weight: 500;
}
.book-detail__placement a:hover {
  text-decoration: underline;
}
.book-detail__error {
  padding: 1.25rem;
  background: color-mix(in srgb, var(--p-red-500, #dc2626) 10%, transparent);
  border-radius: 12px;
  color: var(--p-red-700, #b91c1c);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}
@media (max-width: 720px) {
  .book-detail__skeleton,
  .book-detail__body {
    grid-template-columns: 1fr;
  }
  .book-detail__cover {
    width: 160px;
  }
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .book-detail__facts dd {
  color: var(--p-surface-100);
}
html.dark .book-detail__placement {
  color: var(--p-surface-300);
}
html.dark .book-detail__placement a {
  color: var(--p-primary-300);
}
</style>
