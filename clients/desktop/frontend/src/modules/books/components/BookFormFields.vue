<script setup lang="ts">
/**
 * BookFormFields — campi del form, condivisi tra Create dialog e Edit view.
 * v-model:form ↔ BookInput, v-model:authorsRaw ↔ string (textarea raw).
 */
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import { FORMAT_OPTIONS, type BookInput } from '../types';

defineProps<{
  form: BookInput;
  authorsRaw: string;
  errorMessage?: string | null;
}>();

defineEmits<{
  (e: 'update:form', v: BookInput): void;
  (e: 'update:authorsRaw', v: string): void;
}>();
</script>

<template>
  <form class="book-form" @submit.prevent>
    <div class="book-form__row book-form__row--full">
      <label class="book-form__label" for="bf-title">
        Titolo <span aria-hidden="true" class="book-form__req">*</span>
      </label>
      <InputText
        id="bf-title"
        :model-value="form.title"
        @update:model-value="(v) => $emit('update:form', { ...form, title: String(v ?? '') })"
        autocomplete="off"
        required
        :invalid="!form.title.trim()"
      />
    </div>

    <div class="book-form__row book-form__row--full">
      <label class="book-form__label" for="bf-subtitle">Sottotitolo</label>
      <InputText
        id="bf-subtitle"
        :model-value="form.subtitle"
        @update:model-value="(v) => $emit('update:form', { ...form, subtitle: String(v ?? '') })"
      />
    </div>

    <div class="book-form__row book-form__row--full">
      <label class="book-form__label" for="bf-authors">
        Autori <span class="book-form__hint">(uno per riga o separati da virgola)</span>
      </label>
      <Textarea
        id="bf-authors"
        :model-value="authorsRaw"
        @update:model-value="(v) => $emit('update:authorsRaw', String(v ?? ''))"
        rows="2"
        auto-resize
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-isbn13">ISBN-13</label>
      <InputText
        id="bf-isbn13"
        :model-value="form.isbn_13"
        @update:model-value="(v) => $emit('update:form', { ...form, isbn_13: String(v ?? '') })"
        autocomplete="off"
        inputmode="numeric"
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-isbn10">ISBN-10</label>
      <InputText
        id="bf-isbn10"
        :model-value="form.isbn_10"
        @update:model-value="(v) => $emit('update:form', { ...form, isbn_10: String(v ?? '') })"
        autocomplete="off"
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-publisher">Editore</label>
      <InputText
        id="bf-publisher"
        :model-value="form.publisher"
        @update:model-value="(v) => $emit('update:form', { ...form, publisher: String(v ?? '') })"
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-year">Anno</label>
      <InputNumber
        id="bf-year"
        :model-value="form.published_year || null"
        @update:model-value="(v) => $emit('update:form', { ...form, published_year: Number(v ?? 0) })"
        :use-grouping="false"
        :min="0"
        :max="3000"
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-format">Formato</label>
      <Select
        id="bf-format"
        :model-value="form.format"
        @update:model-value="(v) => $emit('update:form', { ...form, format: String(v ?? '') })"
        :options="FORMAT_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="Seleziona…"
        show-clear
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-language">Lingua</label>
      <InputText
        id="bf-language"
        :model-value="form.language"
        @update:model-value="(v) => $emit('update:form', { ...form, language: String(v ?? '') })"
        placeholder="it, en, …"
        maxlength="8"
      />
    </div>

    <div class="book-form__row">
      <label class="book-form__label" for="bf-pages">Pagine</label>
      <InputNumber
        id="bf-pages"
        :model-value="form.page_count || null"
        @update:model-value="(v) => $emit('update:form', { ...form, page_count: Number(v ?? 0) })"
        :use-grouping="false"
        :min="0"
      />
    </div>

    <div class="book-form__row book-form__row--full">
      <label class="book-form__label" for="bf-desc">Descrizione</label>
      <Textarea
        id="bf-desc"
        :model-value="form.description"
        @update:model-value="(v) => $emit('update:form', { ...form, description: String(v ?? '') })"
        rows="4"
        auto-resize
      />
    </div>

    <div class="book-form__row book-form__row--full">
      <label class="book-form__label" for="bf-notes">Note personali</label>
      <Textarea
        id="bf-notes"
        :model-value="form.notes"
        @update:model-value="(v) => $emit('update:form', { ...form, notes: String(v ?? '') })"
        rows="3"
        auto-resize
      />
    </div>

    <p v-if="errorMessage" class="book-form__error" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      {{ errorMessage }}
    </p>
  </form>
</template>

<style scoped>
.book-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.25rem;
}
.book-form__row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
.book-form__row--full {
  grid-column: 1 / -1;
}
.book-form__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-surface-700);
  letter-spacing: 0.01em;
}
.book-form__hint {
  font-weight: 400;
  color: var(--p-surface-500);
  margin-left: 0.25rem;
}
.book-form__req {
  color: var(--p-red-500, #dc2626);
}
.book-form__error {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--p-red-500, #dc2626) 10%, transparent);
  color: var(--p-red-600, #b91c1c);
  font-size: 0.875rem;
}
@media (max-width: 640px) {
  .book-form {
    grid-template-columns: 1fr;
  }
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .book-form__label {
  color: var(--p-surface-200);
}
html.dark .book-form__hint {
  color: var(--p-surface-400);
}
</style>
