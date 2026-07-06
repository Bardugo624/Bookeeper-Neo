<script setup lang="ts">
/**
 * BookEditView — pagina full-form per modificare un libro esistente.
 * Carica il record, idrata il composable, salva via PATCH, redirect al
 * dettaglio.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import { useBooksStore } from '../store';
import { useBookForm } from '../composables/useBookForm';
import BookFormFields from '../components/BookFormFields.vue';

const props = defineProps<{ id: string }>();

const store = useBooksStore();
const router = useRouter();
const { t } = useI18n();

const ready = ref(false);
const submitting = ref(false);
const { form, authorsRaw, submitError, submit, reset } = useBookForm(null);

onMounted(async () => {
  try {
    const b = await store.fetchOne(props.id);
    reset(b);
  } finally {
    ready.value = true;
  }
});

async function onSave(): Promise<void> {
  submitting.value = true;
  try {
    await submit(props.id);
    void router.push({ name: 'book-detail', params: { id: props.id } });
  } catch {
    /* submitError mostrato nel form */
  } finally {
    submitting.value = false;
  }
}

function onCancel(): void {
  void router.push({ name: 'book-detail', params: { id: props.id } });
}
</script>

<template>
  <section class="book-edit">
    <header class="book-edit__header">
      <Button
        icon="pi pi-arrow-left"
        :label="t('books.edit.cancel')"
        text
        severity="secondary"
        :disabled="submitting"
        @click="onCancel"
      />
      <h1 class="book-edit__title">{{ t('books.edit.title') }}</h1>
    </header>

    <div v-if="!ready" class="book-edit__skel">
      <Skeleton width="100%" height="3rem" />
      <Skeleton width="100%" height="3rem" />
      <Skeleton width="100%" height="6rem" />
    </div>

    <div v-else class="book-edit__panel">
      <BookFormFields
        :form="form"
        :authors-raw="authorsRaw"
        :error-message="submitError"
        @update:form="(v) => Object.assign(form, v)"
        @update:authors-raw="(v) => (authorsRaw = v)"
      />
      <div class="book-edit__actions">
        <Button
          :label="t('books.edit.cancel')"
          severity="secondary"
          text
          :disabled="submitting"
          @click="onCancel"
        />
        <Button
          icon="pi pi-check"
          :label="t('books.edit.save')"
          :loading="submitting"
          :disabled="!form.title.trim()"
          @click="onSave"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.book-edit {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.book-edit__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.book-edit__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}
.book-edit__skel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.book-edit__panel {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 14px;
  padding: 1.5rem;
}
.book-edit__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--p-surface-200);
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .book-edit__panel {
  background: var(--p-surface-800);
  border-color: var(--p-surface-700);
}
html.dark .book-edit__actions {
  border-color: var(--p-surface-700);
}
</style>
