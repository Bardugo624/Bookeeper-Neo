<script setup lang="ts">
/**
 * ShelfConfigDialog — modale create/edit per uno scaffale.
 *
 * Validazione client-side mirror della validazione server (rows /
 * slotsPerRow / capacity max). I limiti sono importati dai costanti
 * pubblicate in `types.ts` per evitare drift.
 */
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import {
  EMPTY_SHELF_INPUT,
  SHELF_COLOR_OPTIONS,
  SHELF_ROWS_MAX,
  SHELF_ROWS_MIN,
  SHELF_SLOTS_MAX,
  SHELF_SLOTS_MIN,
  SHELF_CAPACITY_MAX,
  type ShelfColor,
  type ShelfInput,
} from '../types';

interface Props {
  visible: boolean;
  /** Quando definito, dialog in modalità "modifica". */
  initial?: ShelfInput | null;
  saving?: boolean;
  /** Errore server da mostrare in cima al form. */
  error?: string | null;
}
const props = withDefaults(defineProps<Props>(), {
  initial: null,
  saving: false,
  error: null,
});

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'submit', input: ShelfInput): void;
}>();

const form = ref<ShelfInput>({ ...EMPTY_SHELF_INPUT });

watch(
  () => [props.visible, props.initial],
  () => {
    if (props.visible) {
      form.value = props.initial
        ? { ...props.initial }
        : { ...EMPTY_SHELF_INPUT };
    }
  },
  { immediate: true },
);

const capacity = computed(() => form.value.rows * form.value.slots_per_row);
const isEdit = computed(() => !!props.initial);

const validationError = computed<string | null>(() => {
  const f = form.value;
  if (!f.name.trim()) return 'Inserisci un nome';
  if (f.rows < SHELF_ROWS_MIN || f.rows > SHELF_ROWS_MAX)
    return `Mensole consentite: ${SHELF_ROWS_MIN}-${SHELF_ROWS_MAX}`;
  if (f.slots_per_row < SHELF_SLOTS_MIN || f.slots_per_row > SHELF_SLOTS_MAX)
    return `Slot per mensola: ${SHELF_SLOTS_MIN}-${SHELF_SLOTS_MAX}`;
  if (capacity.value > SHELF_CAPACITY_MAX)
    return `Capacità massima: ${SHELF_CAPACITY_MAX} slot`;
  return null;
});

function close(): void {
  emit('update:visible', false);
}
function submit(): void {
  if (validationError.value) return;
  emit('submit', { ...form.value, name: form.value.name.trim() });
}
function pickColor(c: ShelfColor): void {
  form.value.color = c;
}
</script>

<template>
  <Dialog
    :visible="visible"
    :modal="true"
    :closable="!saving"
    :dismissable-mask="!saving"
    :style="{ width: '480px' }"
    :header="isEdit ? 'Modifica scaffale' : 'Nuovo scaffale'"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="shelf-form" @submit.prevent="submit">
      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="shelf-form__alert"
      >
        {{ error }}
      </Message>

      <div class="shelf-form__field">
        <label for="shelf-name" class="shelf-form__label">Nome</label>
        <InputText
          id="shelf-name"
          v-model="form.name"
          autocomplete="off"
          required
          maxlength="80"
          placeholder="Es. Salotto, Studio, Camera ragazzi…"
        />
      </div>

      <div class="shelf-form__row">
        <div class="shelf-form__field">
          <label for="shelf-rows" class="shelf-form__label">Mensole</label>
          <InputNumber
            id="shelf-rows"
            v-model="form.rows"
            :min="SHELF_ROWS_MIN"
            :max="SHELF_ROWS_MAX"
            show-buttons
            button-layout="horizontal"
            input-class="shelf-form__num"
          >
            <template #incrementbuttonicon><i class="pi pi-plus" /></template>
            <template #decrementbuttonicon><i class="pi pi-minus" /></template>
          </InputNumber>
          <small class="shelf-form__hint">{{ SHELF_ROWS_MIN }}-{{ SHELF_ROWS_MAX }}</small>
        </div>

        <div class="shelf-form__field">
          <label for="shelf-slots" class="shelf-form__label">Slot per mensola</label>
          <InputNumber
            id="shelf-slots"
            v-model="form.slots_per_row"
            :min="SHELF_SLOTS_MIN"
            :max="SHELF_SLOTS_MAX"
            show-buttons
            button-layout="horizontal"
            input-class="shelf-form__num"
          >
            <template #incrementbuttonicon><i class="pi pi-plus" /></template>
            <template #decrementbuttonicon><i class="pi pi-minus" /></template>
          </InputNumber>
          <small class="shelf-form__hint">{{ SHELF_SLOTS_MIN }}-{{ SHELF_SLOTS_MAX }}</small>
        </div>
      </div>

      <div class="shelf-form__capacity" aria-live="polite">
        <i class="pi pi-database" aria-hidden="true" />
        Capacità totale: <strong>{{ capacity }}</strong> slot
      </div>

      <div class="shelf-form__field">
        <span class="shelf-form__label">Colore</span>
        <div class="shelf-form__swatches" role="radiogroup" aria-label="Colore scaffale">
          <button
            v-for="opt in SHELF_COLOR_OPTIONS"
            :key="opt.value"
            type="button"
            class="shelf-form__swatch"
            :class="{ 'shelf-form__swatch--active': form.color === opt.value }"
            :style="{ background: opt.swatch }"
            role="radio"
            :aria-checked="form.color === opt.value"
            :aria-label="opt.label"
            :title="opt.label"
            @click="pickColor(opt.value)"
          >
            <i v-if="form.color === opt.value" class="pi pi-check" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Message
        v-if="validationError"
        severity="warn"
        :closable="false"
        class="shelf-form__alert"
      >
        {{ validationError }}
      </Message>
    </form>

    <template #footer>
      <Button label="Annulla" severity="secondary" text :disabled="saving" @click="close" />
      <Button
        :label="isEdit ? 'Salva' : 'Crea scaffale'"
        :loading="saving"
        :disabled="!!validationError"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.shelf-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.shelf-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.shelf-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.shelf-form__label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--p-surface-700);
}
.shelf-form__hint {
  color: var(--p-surface-500);
  font-size: 0.75rem;
}
.shelf-form__num {
  text-align: center;
  width: 100%;
}
.shelf-form__capacity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--p-primary-500) 8%, transparent);
  color: var(--p-primary-700);
  font-size: 0.875rem;
}
.shelf-form__swatches {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.shelf-form__swatch {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 2px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.85rem;
  padding: 0;
  transition: transform 120ms ease, border-color 120ms ease;
}
.shelf-form__swatch:hover {
  transform: scale(1.05);
}
.shelf-form__swatch--active {
  border-color: var(--p-surface-900);
  box-shadow: 0 0 0 2px var(--p-surface-0);
}
.shelf-form__swatch:focus-visible {
  outline: 2px solid var(--p-primary-500);
  outline-offset: 2px;
}
.shelf-form__alert {
  margin: 0;
}
</style>

<style>
html.dark .shelf-form__label {
  color: var(--p-surface-200);
}
html.dark .shelf-form__hint {
  color: var(--p-surface-400);
}
html.dark .shelf-form__capacity {
  background: color-mix(in srgb, var(--p-primary-500) 18%, transparent);
  color: var(--p-primary-200);
}
html.dark .shelf-form__swatch--active {
  border-color: var(--p-surface-50);
  box-shadow: 0 0 0 2px var(--p-surface-900);
}
</style>
