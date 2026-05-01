<!--
    LoanCard.vue — Card prestito singolo.
    
    Border-left colorato per stato (info/warn/danger/success) per
    distinguibilità non-cromatica (color-not-only). Header con titolo
    libro cliccabile (link a book-detail) + tag stato + giorni
    residui/ritardo. Footer azioni cambia in base allo stato:
      - active/overdue: Restituito (success) | Modifica | Elimina
      - returned: Riapri | Elimina
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import {
    daysRemaining,
    deriveStatus,
    parseAuthors,
    statusMeta,
    type Loan,
} from '../types';

interface Props {
    loan: Loan;
    nowSec: number;
    busy?: boolean;
}

const props = withDefaults(defineProps<Props>(), { busy: false });

const emit = defineEmits<{
    (e: 'edit', loan: Loan): void;
    (e: 'delete', loan: Loan): void;
    (e: 'return', loan: Loan): void;
    (e: 'reopen', loan: Loan): void;
}>();

const router = useRouter();

const status = computed(() => deriveStatus(props.loan, props.nowSec));
const meta = computed(() => statusMeta(status.value));
const authorsArr = computed(() => parseAuthors(props.loan.book_authors));
const remaining = computed(() => daysRemaining(props.loan, props.nowSec));

const remainingLabel = computed(() => {
    const r = remaining.value;
    if (r === null) return null;
    if (r < 0) return `${Math.abs(r)} ${Math.abs(r) === 1 ? 'giorno' : 'giorni'} di ritardo`;
    if (r === 0) return 'Scade oggi';
    if (r === 1) return 'Scade domani';
    return `Scade tra ${r} giorni`;
});

const dateFmt = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

const lentLabel = computed(() => dateFmt.format(new Date(props.loan.lent_at * 1000)));
const dueLabel = computed(() =>
    props.loan.due_at && props.loan.due_at > 0
        ? dateFmt.format(new Date(props.loan.due_at * 1000))
        : null,
);
const returnedLabel = computed(() =>
    props.loan.returned_at && props.loan.returned_at > 0
        ? dateFmt.format(new Date(props.loan.returned_at * 1000))
        : null,
);

function openBook(): void {
    router.push({ name: 'book-detail', params: { id: props.loan.book_id } });
}
</script>

<template>
    <article
        class="loan-card"
        :class="`loan-card--${status}`"
        :aria-label="`Prestito di ${loan.book_title || 'libro sconosciuto'} a ${loan.borrower_name}`"
    >
        <header class="loan-card__head">
            <div class="loan-card__title-block">
                <button
                    type="button"
                    class="loan-card__title"
                    :title="loan.book_title || 'Libro non disponibile'"
                    @click="openBook"
                >
                    {{ loan.book_title || '— Libro non più disponibile —' }}
                </button>
                <p v-if="authorsArr.length" class="loan-card__authors">
                    {{ authorsArr.join(', ') }}
                </p>
            </div>
            <Tag
                :value="meta.label"
                :severity="meta.severity"
                :icon="meta.icon"
                class="loan-card__status"
            />
        </header>

        <div class="loan-card__borrower">
            <i class="pi pi-user" aria-hidden="true" />
            <span>{{ loan.borrower_name }}</span>
        </div>

        <dl class="loan-card__meta">
            <div class="loan-card__meta-row">
                <dt>Prestato</dt>
                <dd>{{ lentLabel }}</dd>
            </div>
            <div v-if="dueLabel" class="loan-card__meta-row">
                <dt>Scadenza</dt>
                <dd>
                    {{ dueLabel }}
                    <span
                        v-if="remainingLabel && status !== 'returned'"
                        class="loan-card__remaining"
                        :class="{ 'loan-card__remaining--late': status === 'overdue' }"
                    >
                        · {{ remainingLabel }}
                    </span>
                </dd>
            </div>
            <div v-if="returnedLabel" class="loan-card__meta-row">
                <dt>Restituito</dt>
                <dd>{{ returnedLabel }}</dd>
            </div>
        </dl>

        <p v-if="loan.notes" class="loan-card__notes">{{ loan.notes }}</p>

        <footer class="loan-card__actions">
            <template v-if="status !== 'returned'">
                <Button
                    label="Restituito"
                    icon="pi pi-check"
                    severity="success"
                    size="small"
                    :loading="busy"
                    @click="emit('return', loan)"
                />
                <Button
                    label="Modifica"
                    icon="pi pi-pencil"
                    severity="secondary"
                    outlined
                    size="small"
                    :disabled="busy"
                    @click="emit('edit', loan)"
                />
            </template>
            <template v-else>
                <Button
                    label="Riapri"
                    icon="pi pi-undo"
                    severity="secondary"
                    outlined
                    size="small"
                    :loading="busy"
                    @click="emit('reopen', loan)"
                />
            </template>
            <Button
                label="Elimina"
                icon="pi pi-trash"
                severity="danger"
                text
                size="small"
                class="loan-card__delete"
                :disabled="busy"
                @click="emit('delete', loan)"
            />
        </footer>
    </article>
</template>

<style scoped>
.loan-card {
    --loan-accent: var(--p-primary-500);
    background: var(--p-surface-0);
    border: 1px solid var(--p-surface-200);
    border-left: 4px solid var(--loan-accent);
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
        box-shadow 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.loan-card--active   { --loan-accent: var(--p-blue-500); }
.loan-card--overdue  { --loan-accent: var(--p-red-500); }
.loan-card--returned { --loan-accent: var(--p-green-500); }

.loan-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px -8px rgba(15, 23, 42, 0.18);
}

.loan-card__head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    justify-content: space-between;
}

.loan-card__title-block {
    min-width: 0;
    flex: 1;
}

.loan-card__title {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    text-align: left;
    font-family: 'Lora', serif;
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--p-surface-900);
    cursor: pointer;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: color 150ms ease;
}

.loan-card__title:hover {
    color: var(--p-primary-600);
    text-decoration: underline;
    text-underline-offset: 2px;
}

.loan-card__title:focus-visible {
    outline: 2px solid var(--p-primary-500);
    outline-offset: 2px;
    border-radius: 2px;
}

.loan-card__authors {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--p-surface-500);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
}

.loan-card__status {
    flex-shrink: 0;
}

.loan-card__borrower {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: var(--p-surface-50);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--p-surface-800);
    align-self: flex-start;
}

.loan-card__borrower i {
    color: var(--p-surface-500);
}

.loan-card__meta {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.375rem;
    margin: 0;
}

.loan-card__meta-row {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.4;
}

.loan-card__meta-row dt {
    color: var(--p-surface-500);
    font-weight: 500;
}

.loan-card__meta-row dd {
    margin: 0;
    color: var(--p-surface-800);
    font-variant-numeric: tabular-nums;
}

.loan-card__remaining {
    color: var(--p-surface-500);
    font-size: 0.75rem;
}

.loan-card__remaining--late {
    color: var(--p-red-600);
    font-weight: 500;
}

.loan-card__notes {
    margin: 0;
    padding: 0.625rem 0.75rem;
    background: var(--p-surface-50);
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--p-surface-700);
    white-space: pre-wrap;
}

.loan-card__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 0.5rem;
    border-top: 1px solid var(--p-surface-100);
}

.loan-card__delete {
    margin-left: auto;
}

@media (prefers-reduced-motion: reduce) {
    .loan-card,
    .loan-card__title {
        transition: none;
    }
    .loan-card:hover {
        transform: none;
    }
}
</style>

<style>
html.dark .loan-card {
    background: var(--p-surface-900);
    border-color: var(--p-surface-700);
}

html.dark .loan-card:hover {
    box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.6);
}

html.dark .loan-card__title {
    color: var(--p-surface-50);
}

html.dark .loan-card__title:hover {
    color: var(--p-primary-300);
}

html.dark .loan-card__authors,
html.dark .loan-card__remaining {
    color: var(--p-surface-400);
}

html.dark .loan-card__borrower {
    background: var(--p-surface-800);
    color: var(--p-surface-100);
}

html.dark .loan-card__borrower i {
    color: var(--p-surface-400);
}

html.dark .loan-card__meta-row dt {
    color: var(--p-surface-400);
}

html.dark .loan-card__meta-row dd {
    color: var(--p-surface-100);
}

html.dark .loan-card__remaining--late {
    color: var(--p-red-400);
}

html.dark .loan-card__notes {
    background: var(--p-surface-800);
    color: var(--p-surface-200);
}

html.dark .loan-card__actions {
    border-top-color: var(--p-surface-700);
}
</style>
