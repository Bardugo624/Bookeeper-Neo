<script setup lang="ts">
/**
 * BookFormFields — campi del form, condivisi tra Create dialog e Edit view.
 * v-model:form ↔ BookInput, v-model:authorsRaw ↔ string (textarea raw).
 *
 * Il campo Autori mostra una riga live di chip che riflettono come la
 * stringa raw viene splittata su `,` / newline — così la separazione
 * automatica è visibile mentre si digita. Click sulla X di una chip
 * rimuove l'autore corrispondente dalla raw.
 */
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import { FORMAT_OPTIONS, type BookInput } from '../types';

const props = defineProps<{
  form: BookInput;
  authorsRaw: string;
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:form', v: BookInput): void;
  (e: 'update:authorsRaw', v: string): void;
}>();

/** Parsing identico a useBookForm.syncAuthors per coerenza visuale. */
const parsedAuthors = computed<string[]>(() =>
  props.authorsRaw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
);

function removeAuthor(idx: number): void {
  const next = parsedAuthors.value.filter((_, i) => i !== idx);
  emit('update:authorsRaw', next.join(', '));
}
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
        Autori <span class="book-form__hint">(separa con virgola o invio)</span>
      </label>
      <Textarea
        id="bf-authors"
        :model-value="authorsRaw"
        @update:model-value="(v) => $emit('update:authorsRaw', String(v ?? ''))"
        rows="2"
        auto-resize
        :aria-describedby="parsedAuthors.length ? 'bf-authors-chips' : undefined"
      />
      <TransitionGroup
        v-if="parsedAuthors.length"
        id="bf-authors-chips"
        tag="ul"
        name="chip"
        class="book-form__chips"
        aria-live="polite"
        :aria-label="`${parsedAuthors.length} autori riconosciuti`"
      >
        <li
          v-for="(name, idx) in parsedAuthors"
          :key="`${idx}-${name}`"
          class="book-form__chip"
        >
          <i class="pi pi-user book-form__chip-icon" aria-hidden="true" />
          <span class="book-form__chip-name">{{ name }}</span>
          <button
            type="button"
            class="book-form__chip-remove"
            :aria-label="`Rimuovi ${name}`"
            @click="removeAuthor(idx)"
          >
            <i class="pi pi-times" aria-hidden="true" />
          </button>
        </li>
      </TransitionGroup>
      <p v-else class="book-form__chips-empty">
        Nessun autore inserito.
      </p>
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
      <label class="book-form__label" for="bf-genre">
        Genere <span class="book-form__hint">(es. Romanzo, Saggio, Fantasy)</span>
      </label>
      <InputText
        id="bf-genre"
        :model-value="form.genre"
        @update:model-value="(v) => $emit('update:form', { ...form, genre: String(v ?? '') })"
        autocomplete="off"
        maxlength="60"
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

/* --- Authors live chips --- */
.book-form__chips {
  list-style: none;
  margin: 0.375rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.book-form__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.25rem 0.25rem 0.625rem;
  min-height: 32px;
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-700);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 30%, transparent);
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1;
  max-width: 100%;
}
.book-form__chip-icon {
  font-size: 0.7rem;
  opacity: 0.85;
}
.book-form__chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-form__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 0.7rem;
  transition: background-color 150ms ease;
}
.book-form__chip-remove:hover {
  background: color-mix(in srgb, var(--p-primary-500) 25%, transparent);
}
.book-form__chip-remove:focus-visible {
  outline: 2px solid var(--p-primary-500);
  outline-offset: 1px;
}
.book-form__chips-empty {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: var(--p-surface-500);
  font-style: italic;
}
/* Transizione comparsa/scomparsa chip (rispetta reduced-motion). */
.chip-enter-active,
.chip-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
.chip-leave-active {
  position: absolute;
}
@media (prefers-reduced-motion: reduce) {
  .chip-enter-active,
  .chip-leave-active {
    transition: none;
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
html.dark .book-form__chip {
  background: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
  color: var(--p-primary-200);
  border-color: color-mix(in srgb, var(--p-primary-500) 45%, transparent);
}
html.dark .book-form__chip-remove:hover {
  background: color-mix(in srgb, var(--p-primary-500) 40%, transparent);
}
html.dark .book-form__chips-empty {
  color: var(--p-surface-400);
}
</style>
