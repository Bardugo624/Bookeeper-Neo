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
import { computed, ref } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { lookupIsbn, normalizeIsbn } from '@/lib/googleBooks';
import { FORMAT_OPTIONS, type BookInput } from '../types';

const props = defineProps<{
  form: BookInput;
  authorsRaw: string;
  errorMessage?: string | null;
  /**
   * Numero progressivo suggerito (MAX+1 sul tenant). Quando presente e
   * diverso dal valore corrente del form viene mostrato un pulsante
   * "Usa #N" accanto al campo. Opzionale: puo' essere null se non ancora
   * caricato o se il chiamante non vuole offrire il suggerimento.
   */
  suggestedProgressive?: number | null;
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

// ---------- Lookup ISBN (Google Books) ----------
const toast = useToast();
const lookupLoading = ref(false);

/** ISBN candidato per il lookup: preferiamo ISBN-13, fallback su ISBN-10. */
const lookupIsbnValue = computed(() => {
  const v13 = normalizeIsbn(props.form.isbn_13 || '');
  if (v13.length === 13) return v13;
  const v10 = normalizeIsbn(props.form.isbn_10 || '');
  if (v10.length === 10) return v10;
  return '';
});

async function doLookup(): Promise<void> {
  const isbn = lookupIsbnValue.value;
  if (!isbn) {
    toast.add({
      severity: 'warn',
      summary: 'ISBN mancante',
      detail: 'Inserisci un ISBN-13 o ISBN-10 valido prima del lookup.',
      life: 3500,
    });
    return;
  }
  lookupLoading.value = true;
  try {
    const info = await lookupIsbn(isbn);
    if (!info) {
      toast.add({
        severity: 'info',
        summary: 'Nessun risultato',
        detail: `Google Libri non conosce l'ISBN ${isbn}.`,
        life: 3500,
      });
      return;
    }
    // Riempi solo i campi vuoti per non sovrascrivere modifiche manuali.
    const f = props.form;
    const merged: BookInput = {
      ...f,
      title: f.title || info.title,
      subtitle: f.subtitle || info.subtitle,
      authors: f.authors.length > 0 ? f.authors : info.authors,
      publisher: f.publisher || info.publisher,
      published_year: f.published_year || info.publishedYear,
      page_count: f.page_count || info.pageCount,
      description: f.description || info.description,
      language: f.language || info.language,
      isbn_13: f.isbn_13 || info.isbn13,
      isbn_10: f.isbn_10 || info.isbn10,
    };
    emit('update:form', merged);
    // Se gli autori arrivano dal lookup, sincronizza anche la textarea raw.
    if (f.authors.length === 0 && info.authors.length > 0) {
      emit('update:authorsRaw', info.authors.join(', '));
    }
    toast.add({
      severity: 'success',
      summary: 'Metadati importati',
      detail: info.title || 'Lookup completato',
      life: 2500,
    });
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Lookup fallito',
      detail: err instanceof Error ? err.message : 'errore di rete',
      life: 4000,
    });
  } finally {
    lookupLoading.value = false;
  }
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
      <div class="book-form__isbn">
        <InputText
          id="bf-isbn13"
          :model-value="form.isbn_13"
          @update:model-value="(v) => $emit('update:form', { ...form, isbn_13: String(v ?? '') })"
          autocomplete="off"
          inputmode="numeric"
          class="book-form__isbn-input"
        />
        <Button
          type="button"
          icon="pi pi-search"
          label="Lookup"
          severity="secondary"
          outlined
          size="small"
          :loading="lookupLoading"
          :disabled="!lookupIsbnValue || lookupLoading"
          title="Recupera titolo, autori, editore... da Google Libri"
          @click="doLookup"
        />
      </div>
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

    <div class="book-form__row">
      <label class="book-form__label" for="bf-progressive">
        N° progressivo
        <span class="book-form__hint">(univoco — vuoto = nessuno)</span>
      </label>
      <div class="book-form__progressive">
        <InputNumber
          id="bf-progressive"
          :model-value="form.progressive_number || null"
          @update:model-value="(v) => $emit('update:form', { ...form, progressive_number: Number(v ?? 0) })"
          :use-grouping="false"
          :min="1"
          :max="9999999"
          show-buttons
          button-layout="horizontal"
          decrement-button-class="p-button-secondary"
          increment-button-class="p-button-secondary"
          placeholder="—"
          fluid
        />
        <button
          v-if="suggestedProgressive != null && form.progressive_number !== suggestedProgressive"
          type="button"
          class="book-form__suggest"
          :aria-label="`Suggerisci numero ${suggestedProgressive}`"
          @click="$emit('update:form', { ...form, progressive_number: suggestedProgressive })"
        >
          <i class="pi pi-bolt" aria-hidden="true" />
          Usa #{{ suggestedProgressive }}
        </button>
      </div>
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
.book-form__isbn {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}
.book-form__isbn-input {
  flex: 1;
  min-width: 0;
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
.book-form__progressive {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.book-form__progressive :deep(.p-inputnumber) {
  flex: 1;
  min-width: 0;
}
.book-form__suggest {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.65rem;
  border-radius: 6px;
  border: 1px dashed color-mix(in srgb, var(--p-primary-500) 50%, transparent);
  background: color-mix(in srgb, var(--p-primary-500) 8%, transparent);
  color: var(--p-primary-700);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 150ms ease, border-color 150ms ease;
}
.book-form__suggest:hover {
  background: color-mix(in srgb, var(--p-primary-500) 15%, transparent);
  border-style: solid;
}
.book-form__suggest:focus-visible {
  outline: 2px solid var(--p-primary-500);
  outline-offset: 2px;
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
html.dark .book-form__suggest {
  background: color-mix(in srgb, var(--p-primary-500) 18%, transparent);
  color: var(--p-primary-200);
  border-color: color-mix(in srgb, var(--p-primary-500) 55%, transparent);
}
html.dark .book-form__suggest:hover {
  background: color-mix(in srgb, var(--p-primary-500) 28%, transparent);
}
</style>
