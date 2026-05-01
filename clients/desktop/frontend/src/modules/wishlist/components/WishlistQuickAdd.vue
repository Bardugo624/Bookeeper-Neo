<script setup lang="ts">
/**
 * WishlistQuickAdd — barra inline per aggiungere rapidamente una voce
 * alla wishlist senza aprire un dialog. Pattern "command bar" con un
 * solo focus prominente (titolo) + selettore priorità + invio.
 *
 * Trigger: Enter sul titolo o click sul bottone "Aggiungi".
 * Reset: campi puliti dopo successo, focus mantenuto su titolo per
 * inserimenti consecutivi (UX rule: progressive-disclosure + speed).
 */
import { computed, nextTick, ref } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Select from 'primevue/select';
import {
  EMPTY_WISHLIST_INPUT,
  WISHLIST_PRIORITIES,
  type WishlistInput,
  type WishlistPriority,
} from '../types';

const props = defineProps<{
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'submit', input: WishlistInput): void;
}>();

const titleInput = ref<InstanceType<typeof InputText> | null>(null);
const title = ref('');
const isbn = ref('');
const priority = ref<WishlistPriority>(EMPTY_WISHLIST_INPUT.priority);

const canSubmit = computed(() => title.value.trim().length > 0 && !props.saving);

function onSubmit(): void {
  if (!canSubmit.value) return;
  emit('submit', {
    isbn: isbn.value.trim(),
    title: title.value.trim(),
    authors: '',
    source_url: '',
    priority: priority.value,
    notes: '',
  });
}

/**
 * Chiamato dal parent dopo create() risolto: ripulisce la barra e
 * ripristina il focus sul titolo per consentire add consecutivi.
 */
async function reset(): Promise<void> {
  title.value = '';
  isbn.value = '';
  priority.value = EMPTY_WISHLIST_INPUT.priority;
  await nextTick();
  // PrimeVue InputText non espone `.focus()` direttamente: trova l'input nativo.
  const el = (titleInput.value as unknown as { $el?: HTMLInputElement } | null)
    ?.$el;
  if (el && typeof el.focus === 'function') el.focus();
}

defineExpose({ reset });
</script>

<template>
  <form class="wquick" @submit.prevent="onSubmit">
    <div class="wquick__row">
      <div class="wquick__field wquick__field--grow">
        <label for="wquick-title" class="wquick__label">Titolo</label>
        <InputText
          id="wquick-title"
          ref="titleInput"
          v-model="title"
          placeholder="es. Le città invisibili — Italo Calvino"
          autocomplete="off"
          :invalid="title.length > 0 && title.trim().length === 0"
        />
      </div>
      <div class="wquick__field wquick__field--isbn">
        <label for="wquick-isbn" class="wquick__label">ISBN</label>
        <InputText
          id="wquick-isbn"
          v-model="isbn"
          placeholder="9788806..."
          autocomplete="off"
          inputmode="numeric"
        />
      </div>
      <div class="wquick__field wquick__field--prio">
        <label for="wquick-prio" class="wquick__label">Priorità</label>
        <Select
          id="wquick-prio"
          v-model="priority"
          :options="WISHLIST_PRIORITIES"
          option-label="label"
          option-value="value"
        >
          <template #option="{ option }">
            <span class="wquick__opt">
              <i :class="option.icon" aria-hidden="true" />
              {{ option.label }}
            </span>
          </template>
        </Select>
      </div>
      <div class="wquick__field wquick__field--cta">
        <Button
          type="submit"
          icon="pi pi-plus"
          label="Aggiungi"
          :disabled="!canSubmit"
          :loading="saving"
        />
      </div>
    </div>
    <p class="wquick__hint">
      <i class="pi pi-info-circle" aria-hidden="true" />
      Premi <kbd>Invio</kbd> per aggiungere alla wishlist; modifica autori, link
      e note dopo dall'elenco sotto.
    </p>
  </form>
</template>

<style scoped>
.wquick {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.125rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.wquick__row {
  display: grid;
  grid-template-columns: 1fr 180px 160px auto;
  gap: 0.75rem;
  align-items: end;
}
.wquick__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.wquick__field--cta {
  align-self: end;
}
.wquick__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-surface-600);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.wquick__opt {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.wquick__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--p-surface-500);
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.wquick__hint kbd {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.72rem;
  padding: 0.05rem 0.35rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 4px;
  background: var(--p-surface-100);
  color: var(--p-surface-700);
}
@media (max-width: 820px) {
  .wquick__row {
    grid-template-columns: 1fr 1fr;
  }
  .wquick__field--grow {
    grid-column: 1 / -1;
  }
  .wquick__field--cta {
    grid-column: 1 / -1;
  }
}
</style>

<!-- Vedi BooksListView per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .wquick {
  background: var(--p-surface-900);
  border-color: var(--p-surface-700);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
html.dark .wquick__label {
  color: var(--p-surface-300);
}
html.dark .wquick__hint {
  color: var(--p-surface-400);
}
html.dark .wquick__hint kbd {
  background: var(--p-surface-800);
  border-color: var(--p-surface-600);
  color: var(--p-surface-200);
}
</style>
