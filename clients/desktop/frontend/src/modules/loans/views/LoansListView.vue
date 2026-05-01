<!--
    LoansListView.vue — Pagina /loans.
    
    Composizione:
      Header (title + sub + Nuovo prestito)
      → Message (errore globale store)
      → Filtri (SelectButton stato con badge count + ricerca testo)
      → Skeleton (loading) / EmptyState / Grid di LoanCard
      → LoanCreateDialog (create+edit)
      → ConfirmDialog (delete + return)
      → Toast feedback
    
    UX rules applicate:
      - state-clarity: badge stato + border-left colorato + label testuale
      - confirmation-dialogs: prima di delete (irreversibile) e return (modifica stato)
      - success-feedback: Toast su ogni mutazione completata
      - error-clarity: Message inline con messaggio backend
      - keyboard-shortcuts: SelectButton e DatePicker raggiungibili via Tab
      - empty-states: messaggi distinti per "vuoto" vs "filtri zero"
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import SelectButton from 'primevue/selectbutton';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

import LoanCard from '../components/LoanCard.vue';
import LoanCreateDialog from '../components/LoanCreateDialog.vue';
import { useLoansStore } from '../store';
import {
    EMPTY_LOAN_INPUT,
    deriveStatus,
    loanToInput,
    parseAuthors,
    type Loan,
    type LoanInput,
    type LoanStatus,
} from '../types';

const store = useLoansStore();
const confirm = useConfirm();
const toast = useToast();

type StatusFilter = 'all' | LoanStatus;

interface FilterOption {
    value: StatusFilter;
    label: string;
}

const statusFilter = ref<StatusFilter>('all');
const search = ref('');

const filterOptions = computed<FilterOption[]>(() => [
    { value: 'all', label: `Tutti (${store.items.length})` },
    { value: 'active', label: `In corso (${store.countByStatus.active})` },
    { value: 'overdue', label: `In ritardo (${store.countByStatus.overdue})` },
    { value: 'returned', label: `Restituiti (${store.countByStatus.returned})` },
]);

const filteredItems = computed<Loan[]>(() => {
    const q = search.value.trim().toLowerCase();
    return store.items.filter((l) => {
        if (statusFilter.value !== 'all') {
            if (deriveStatus(l, store.nowSec) !== statusFilter.value) return false;
        }
        if (!q) return true;
        const hay = [
            l.book_title,
            l.borrower_name,
            l.notes ?? '',
            ...parseAuthors(l.book_authors),
        ]
            .join(' ')
            .toLowerCase();
        return hay.includes(q);
    });
});

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const dialogTarget = ref<Loan | null>(null);
const dialogInitial = ref<LoanInput | null>(null);
const dialogInitialBook = ref<{ id: string; title: string; authors?: string[] } | null>(null);
const dialogError = ref<string | null>(null);
const busyId = ref<string | null>(null);

function openCreate(): void {
    dialogMode.value = 'create';
    dialogTarget.value = null;
    dialogInitial.value = { ...EMPTY_LOAN_INPUT, lent_at: Math.floor(Date.now() / 1000) };
    dialogInitialBook.value = null;
    dialogError.value = null;
    dialogVisible.value = true;
}

function openEdit(loan: Loan): void {
    dialogMode.value = 'edit';
    dialogTarget.value = loan;
    dialogInitial.value = loanToInput(loan);
    dialogInitialBook.value = {
        id: loan.book_id,
        title: loan.book_title,
        authors: parseAuthors(loan.book_authors),
    };
    dialogError.value = null;
    dialogVisible.value = true;
}

async function onSubmitDialog(input: LoanInput): Promise<void> {
    dialogError.value = null;
    try {
        if (dialogMode.value === 'create') {
            await store.create(input);
            toast.add({
                severity: 'success',
                summary: 'Prestito registrato',
                detail: `${input.borrower_name} ha preso il libro in prestito.`,
                life: 3000,
            });
        } else if (dialogTarget.value) {
            await store.update(dialogTarget.value.id, input);
            toast.add({
                severity: 'success',
                summary: 'Prestito aggiornato',
                life: 2500,
            });
        }
        dialogVisible.value = false;
    } catch (e) {
        dialogError.value = (e as Error).message;
    }
}

function onReturn(loan: Loan): void {
    confirm.require({
        message: `Confermi che “${loan.book_title || 'il libro'}” è stato restituito da ${loan.borrower_name}?`,
        header: 'Segna come restituito',
        icon: 'pi pi-check-circle',
        acceptLabel: 'Sì, restituito',
        rejectLabel: 'Annulla',
        acceptProps: { severity: 'success' },
        rejectProps: { severity: 'secondary', text: true },
        accept: async () => {
            busyId.value = loan.id;
            try {
                await store.markReturned(loan.id);
                toast.add({
                    severity: 'success',
                    summary: 'Restituito',
                    detail: 'Bentornato a casa per questo libro.',
                    life: 2500,
                });
            } catch (e) {
                toast.add({
                    severity: 'error',
                    summary: 'Errore',
                    detail: (e as Error).message,
                    life: 4000,
                });
            } finally {
                busyId.value = null;
            }
        },
    });
}

async function onReopen(loan: Loan): Promise<void> {
    busyId.value = loan.id;
    try {
        await store.reopen(loan.id);
        toast.add({
            severity: 'info',
            summary: 'Prestito riaperto',
            life: 2500,
        });
    } catch (e) {
        toast.add({
            severity: 'error',
            summary: 'Errore',
            detail: (e as Error).message,
            life: 4000,
        });
    } finally {
        busyId.value = null;
    }
}

function onDelete(loan: Loan): void {
    confirm.require({
        message: `Eliminare il prestito di “${loan.book_title || 'libro'}” a ${loan.borrower_name}? L'operazione non è reversibile.`,
        header: 'Elimina prestito',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Elimina',
        rejectLabel: 'Annulla',
        acceptProps: { severity: 'danger' },
        rejectProps: { severity: 'secondary', text: true },
        accept: async () => {
            busyId.value = loan.id;
            try {
                await store.remove(loan.id);
                toast.add({
                    severity: 'success',
                    summary: 'Prestito eliminato',
                    life: 2500,
                });
            } catch (e) {
                toast.add({
                    severity: 'error',
                    summary: 'Errore',
                    detail: (e as Error).message,
                    life: 4000,
                });
            } finally {
                busyId.value = null;
            }
        },
    });
}

function clearFilters(): void {
    statusFilter.value = 'all';
    search.value = '';
}

const hasActiveFilters = computed(
    () => statusFilter.value !== 'all' || search.value.trim() !== '',
);

onMounted(async () => {
    store.startTicker();
    try {
        await store.fetchList();
    } catch {
        /* error already in store.error */
    }
});

onBeforeUnmount(() => {
    store.stopTicker();
});
</script>

<template>
    <div class="loans-view">
        <Toast position="bottom-right" />
        <ConfirmDialog />

        <header class="loans-view__header">
            <div class="loans-view__heading">
                <h1>Prestiti</h1>
                <p class="loans-view__sub">
                    Tieni traccia di chi ha preso in prestito quale libro e quando deve restituirlo.
                </p>
            </div>
            <Button
                label="Nuovo prestito"
                icon="pi pi-plus"
                @click="openCreate"
            />
        </header>

        <Message
            v-if="store.error && !store.loadingList"
            severity="error"
            :closable="false"
            class="loans-view__error"
        >
            {{ store.error }}
        </Message>

        <section class="loans-view__filters" aria-label="Filtri prestiti">
            <SelectButton
                v-model="statusFilter"
                :options="filterOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                aria-label="Filtra per stato"
            />
            <IconField class="loans-view__search">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="search"
                    placeholder="Cerca per titolo, persona o nota..."
                    aria-label="Cerca prestiti"
                />
            </IconField>
            <Button
                v-if="hasActiveFilters"
                label="Pulisci"
                icon="pi pi-times"
                severity="secondary"
                text
                size="small"
                @click="clearFilters"
            />
        </section>

        <!-- LOADING -->
        <div v-if="store.loadingList" class="loans-view__grid" aria-busy="true">
            <Skeleton
                v-for="n in 4"
                :key="n"
                height="220px"
                border-radius="0.75rem"
            />
        </div>

        <!-- EMPTY (nessun prestito) -->
        <div
            v-else-if="store.isEmpty"
            class="loans-view__empty"
            role="status"
        >
            <i class="pi pi-share-alt loans-view__empty-icon" aria-hidden="true" />
            <h2>Nessun prestito ancora registrato</h2>
            <p>
                Quando presti un libro, registralo qui per ricordare chi lo ha
                e quando dovrebbe tornare a casa.
            </p>
            <Button
                label="Registra il primo prestito"
                icon="pi pi-plus"
                @click="openCreate"
            />
        </div>

        <!-- EMPTY (filtri zero) -->
        <div
            v-else-if="filteredItems.length === 0"
            class="loans-view__empty loans-view__empty--filtered"
            role="status"
        >
            <i class="pi pi-filter-slash loans-view__empty-icon" aria-hidden="true" />
            <h2>Nessun prestito corrisponde ai filtri</h2>
            <p>Prova a cambiare lo stato selezionato o a svuotare la ricerca.</p>
            <Button
                label="Pulisci filtri"
                icon="pi pi-times"
                severity="secondary"
                outlined
                @click="clearFilters"
            />
        </div>

        <!-- GRID -->
        <div v-else class="loans-view__grid">
            <LoanCard
                v-for="loan in filteredItems"
                :key="loan.id"
                :loan="loan"
                :now-sec="store.nowSec"
                :busy="busyId === loan.id"
                @edit="openEdit"
                @delete="onDelete"
                @return="onReturn"
                @reopen="onReopen"
            />
        </div>

        <LoanCreateDialog
            v-model:visible="dialogVisible"
            :mode="dialogMode"
            :initial="dialogInitial"
            :initial-book="dialogInitialBook"
            :saving="store.saving"
            :error="dialogError"
            @submit="onSubmitDialog"
        />
    </div>
</template>

<style scoped>
.loans-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 1280px;
    margin: 0 auto;
    width: 100%;
}

.loans-view__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
}

.loans-view__heading h1 {
    margin: 0;
    font-family: 'Lora', serif;
    font-size: 1.875rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--p-surface-900);
}

.loans-view__sub {
    margin: 0.375rem 0 0;
    font-size: 0.9375rem;
    color: var(--p-surface-500);
    max-width: 60ch;
    line-height: 1.5;
}

.loans-view__error {
    margin: 0;
}

.loans-view__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
}

.loans-view__search {
    flex: 1;
    min-width: 240px;
    max-width: 420px;
}

.loans-view__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
    align-items: stretch;
}

.loans-view__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 0.75rem;
    padding: 3.5rem 1.5rem;
    background: var(--p-surface-50);
    border: 1px dashed var(--p-surface-200);
    border-radius: 1rem;
}

.loans-view__empty-icon {
    font-size: 2.5rem;
    color: var(--p-surface-400);
}

.loans-view__empty h2 {
    margin: 0;
    font-family: 'Lora', serif;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--p-surface-800);
}

.loans-view__empty p {
    margin: 0 0 0.5rem;
    color: var(--p-surface-500);
    max-width: 48ch;
    line-height: 1.5;
}

@media (max-width: 720px) {
    .loans-view {
        padding: 1rem;
    }

    .loans-view__grid {
        grid-template-columns: 1fr;
    }

    .loans-view__search {
        max-width: none;
        width: 100%;
    }
}
</style>

<style>
html.dark .loans-view__heading h1 {
    color: var(--p-surface-50);
}

html.dark .loans-view__sub {
    color: var(--p-surface-400);
}

html.dark .loans-view__empty {
    background: var(--p-surface-900);
    border-color: var(--p-surface-700);
}

html.dark .loans-view__empty-icon {
    color: var(--p-surface-500);
}

html.dark .loans-view__empty h2 {
    color: var(--p-surface-100);
}

html.dark .loans-view__empty p {
    color: var(--p-surface-400);
}
</style>
