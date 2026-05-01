<!--
    LoanCreateDialog.vue — Dialog di creazione/modifica prestito.
    
    Usa AutoComplete su booksEndpoints.list(q) per scegliere il libro
    (debounced 250ms), DatePicker per le date e Textarea per le note.
    Watcher su props.visible+initial sincronizza il form sia in apertura
    sia quando si passa da modifica → nuovo senza chiudere.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import DatePicker from 'primevue/datepicker';
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete';
import Message from 'primevue/message';
import { booksEndpoints } from '@/lib/api/endpoints/books';
import type { Book } from '@/modules/books/types';
import {
    EMPTY_LOAN_INPUT,
    dateToUnix,
    unixToDate,
    type LoanInput,
} from '../types';

interface Props {
    visible: boolean;
    initial?: LoanInput | null;
    /** Quando si modifica un prestito già con book scelto, il backend
     * restituisce solo book_id. Passiamo titolo+autori per popolare
     * l'AutoComplete senza una refetch del libro. */
    initialBook?: { id: string; title: string; authors?: string[] } | null;
    saving?: boolean;
    error?: string | null;
    mode: 'create' | 'edit';
}

const props = withDefaults(defineProps<Props>(), {
    initial: null,
    initialBook: null,
    saving: false,
    error: null,
});

const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void;
    (e: 'submit', input: LoanInput): void;
}>();

const form = ref<LoanInput>({ ...EMPTY_LOAN_INPUT });
const lentDate = ref<Date | null>(null);
const dueDate = ref<Date | null>(null);
const selectedBook = ref<Book | { id: string; title: string; authors?: string[] } | null>(null);

const bookSuggestions = ref<Book[]>([]);
const searching = ref(false);
let searchHandle: ReturnType<typeof setTimeout> | null = null;

const titleText = computed(() =>
    props.mode === 'edit' ? 'Modifica prestito' : 'Nuovo prestito',
);
const submitLabel = computed(() => (props.mode === 'edit' ? 'Salva' : 'Crea prestito'));

watch(
    () => props.visible,
    (v) => {
        if (!v) return;
        // Sync form da initial.
        const seed = props.initial ?? EMPTY_LOAN_INPUT;
        form.value = { ...seed };
        lentDate.value = unixToDate(seed.lent_at) ?? new Date();
        dueDate.value = unixToDate(seed.due_at);
        selectedBook.value = props.initialBook ?? null;
    },
);

function onBookSearch(ev: AutoCompleteCompleteEvent): void {
    const q = (ev.query ?? '').trim();
    if (searchHandle) clearTimeout(searchHandle);
    searchHandle = setTimeout(async () => {
        searching.value = true;
        try {
            bookSuggestions.value = await booksEndpoints.list(q, 20);
        } catch {
            bookSuggestions.value = [];
        } finally {
            searching.value = false;
        }
    }, 250);
}

function close(): void {
    emit('update:visible', false);
}

function submit(): void {
    if (props.saving) return;
    const bookId =
        selectedBook.value && typeof selectedBook.value === 'object'
            ? selectedBook.value.id
            : '';
    const input: LoanInput = {
        book_id: bookId,
        borrower_name: form.value.borrower_name.trim(),
        lent_at: dateToUnix(lentDate.value) || Math.floor(Date.now() / 1000),
        due_at: dateToUnix(dueDate.value),
        notes: form.value.notes.trim(),
    };
    emit('submit', input);
}

const canSubmit = computed(() => {
    return (
        !!selectedBook.value &&
        !!form.value.borrower_name.trim() &&
        !!lentDate.value
    );
});
</script>

<template>
    <Dialog
        :visible="visible"
        modal
        :header="titleText"
        :style="{ width: '560px' }"
        :breakpoints="{ '720px': '95vw' }"
        :closable="!saving"
        @update:visible="emit('update:visible', $event)"
    >
        <div class="loan-form">
            <Message v-if="error" severity="error" :closable="false" class="loan-form__error">
                {{ error }}
            </Message>

            <div class="loan-form__field loan-form__field--full">
                <label for="loan-book">Libro <span aria-hidden="true">*</span></label>
                <AutoComplete
                    id="loan-book"
                    v-model="selectedBook"
                    :suggestions="bookSuggestions"
                    option-label="title"
                    placeholder="Cerca per titolo, autore o ISBN..."
                    :loading="searching"
                    force-selection
                    fluid
                    @complete="onBookSearch"
                >
                    <template #option="{ option }">
                        <div class="loan-form__book-opt">
                            <span class="loan-form__book-title">{{ option.title }}</span>
                            <span v-if="option.authors?.length" class="loan-form__book-meta">
                                {{ option.authors.join(', ') }}
                            </span>
                        </div>
                    </template>
                </AutoComplete>
                <small class="loan-form__hint">Inizia a scrivere per cercare nella libreria.</small>
            </div>

            <div class="loan-form__field loan-form__field--full">
                <label for="loan-borrower">A chi <span aria-hidden="true">*</span></label>
                <InputText
                    id="loan-borrower"
                    v-model="form.borrower_name"
                    placeholder="Es. Marco, Nonna Lia, Scuola..."
                    autocomplete="off"
                    fluid
                />
            </div>

            <div class="loan-form__field">
                <label for="loan-lent">Data prestito <span aria-hidden="true">*</span></label>
                <DatePicker
                    id="loan-lent"
                    v-model="lentDate"
                    date-format="dd/mm/yy"
                    show-icon
                    icon-display="input"
                    fluid
                />
            </div>

            <div class="loan-form__field">
                <label for="loan-due">Scadenza</label>
                <DatePicker
                    id="loan-due"
                    v-model="dueDate"
                    date-format="dd/mm/yy"
                    show-icon
                    icon-display="input"
                    show-button-bar
                    :min-date="lentDate ?? undefined"
                    fluid
                />
                <small class="loan-form__hint">Lascia vuoto se nessuna scadenza.</small>
            </div>

            <div class="loan-form__field loan-form__field--full">
                <label for="loan-notes">Note</label>
                <Textarea
                    id="loan-notes"
                    v-model="form.notes"
                    rows="3"
                    auto-resize
                    placeholder="Promemoria, condizioni, contatto..."
                    fluid
                />
            </div>
        </div>

        <template #footer>
            <Button
                label="Annulla"
                text
                :disabled="saving"
                @click="close"
            />
            <Button
                :label="submitLabel"
                icon="pi pi-check"
                :loading="saving"
                :disabled="!canSubmit"
                @click="submit"
            />
        </template>
    </Dialog>
</template>

<style scoped>
.loan-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.25rem;
    padding-top: 0.25rem;
}

.loan-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
}

.loan-form__field--full {
    grid-column: 1 / -1;
}

.loan-form__field label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--p-surface-700);
}

.loan-form__field label span[aria-hidden] {
    color: var(--p-red-500);
    margin-left: 0.125rem;
}

.loan-form__hint {
    font-size: 0.75rem;
    color: var(--p-surface-500);
    line-height: 1.4;
}

.loan-form__error {
    grid-column: 1 / -1;
    margin: 0;
}

.loan-form__book-opt {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.loan-form__book-title {
    font-weight: 500;
    color: var(--p-surface-900);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.loan-form__book-meta {
    font-size: 0.75rem;
    color: var(--p-surface-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 560px) {
    .loan-form {
        grid-template-columns: 1fr;
    }
}
</style>

<style>
html.dark .loan-form__field label {
    color: var(--p-surface-200);
}

html.dark .loan-form__hint {
    color: var(--p-surface-400);
}

html.dark .loan-form__book-title {
    color: var(--p-surface-50);
}

html.dark .loan-form__book-meta {
    color: var(--p-surface-400);
}
</style>
