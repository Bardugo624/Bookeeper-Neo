<script setup lang="ts">
/**
 * WishlistEditDialog — form completo (create / edit) per voci wishlist.
 *
 * Pattern v-model:visible, slot footer custom con submit/cancel.
 * Stato form locale, sincronizzato a `initial` ad ogni apertura.
 */
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Message from 'primevue/message';
import {
  EMPTY_WISHLIST_INPUT,
  WISHLIST_PRIORITIES,
  type WishlistInput,
} from '../types';

const props = defineProps<{
  visible: boolean;
  initial: WishlistInput | null;
  saving: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'submit', input: WishlistInput): void;
}>();

const form = ref<WishlistInput>({ ...EMPTY_WISHLIST_INPUT });

watch(
  () => props.visible,
  (v) => {
    if (v) {
      form.value = props.initial
        ? { ...props.initial }
        : { ...EMPTY_WISHLIST_INPUT };
    }
  },
  { immediate: true },
);

const isEdit = () => props.initial !== null;

function close(): void {
  if (props.saving) return;
  emit('update:visible', false);
}

function onSubmit(): void {
  if (!form.value.title.trim()) return;
  emit('submit', { ...form.value, title: form.value.title.trim() });
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v) => emit('update:visible', v)"
    :header="isEdit() ? 'Modifica voce wishlist' : 'Nuova voce wishlist'"
    modal
    :style="{ width: '560px', maxWidth: '95vw' }"
    :closable="!saving"
    :close-on-escape="!saving"
  >
    <form class="wedit" @submit.prevent="onSubmit">
      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="wedit__alert"
      >
        {{ error }}
      </Message>

      <div class="wedit__row wedit__row--full">
        <label class="wedit__label" for="we-title">
          Titolo <span aria-hidden="true" class="wedit__req">*</span>
        </label>
        <InputText
          id="we-title"
          v-model="form.title"
          autocomplete="off"
          required
          :invalid="!form.title.trim()"
        />
      </div>

      <div class="wedit__row wedit__row--full">
        <label class="wedit__label" for="we-authors">
          Autori
          <span class="wedit__hint">(separa con virgola)</span>
        </label>
        <InputText
          id="we-authors"
          v-model="form.authors"
          placeholder="es. Italo Calvino, Umberto Eco"
        />
      </div>

      <div class="wedit__row">
        <label class="wedit__label" for="we-isbn">ISBN</label>
        <InputText
          id="we-isbn"
          v-model="form.isbn"
          inputmode="numeric"
          autocomplete="off"
        />
      </div>

      <div class="wedit__row">
        <label class="wedit__label" for="we-prio">Priorità</label>
        <Select
          id="we-prio"
          v-model="form.priority"
          :options="WISHLIST_PRIORITIES"
          option-label="label"
          option-value="value"
        >
          <template #option="{ option }">
            <span class="wedit__opt">
              <i :class="option.icon" aria-hidden="true" />
              {{ option.label }}
            </span>
          </template>
        </Select>
      </div>

      <div class="wedit__row wedit__row--full">
        <label class="wedit__label" for="we-source">Link fonte</label>
        <InputText
          id="we-source"
          v-model="form.source_url"
          placeholder="https://..."
          inputmode="url"
          autocomplete="off"
        />
      </div>

      <div class="wedit__row wedit__row--full">
        <label class="wedit__label" for="we-notes">Note</label>
        <Textarea
          id="we-notes"
          v-model="form.notes"
          rows="3"
          auto-resize
          placeholder="es. regalo per Marco / cercare in usato / firmato"
        />
      </div>
    </form>

    <template #footer>
      <Button
        label="Annulla"
        severity="secondary"
        text
        :disabled="saving"
        @click="close"
      />
      <Button
        :label="isEdit() ? 'Salva' : 'Aggiungi'"
        icon="pi pi-check"
        :disabled="!form.title.trim()"
        :loading="saving"
        @click="onSubmit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.wedit {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem 1rem;
  padding: 0.25rem 0;
}
.wedit__alert {
  grid-column: 1 / -1;
  margin: 0;
}
.wedit__row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
.wedit__row--full {
  grid-column: 1 / -1;
}
.wedit__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-surface-700);
}
.wedit__hint {
  font-weight: 400;
  color: var(--p-surface-500);
  margin-left: 0.25rem;
}
.wedit__req {
  color: var(--p-red-500, #dc2626);
}
.wedit__opt {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
@media (max-width: 540px) {
  .wedit {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
html.dark .wedit__label {
  color: var(--p-surface-200);
}
html.dark .wedit__hint {
  color: var(--p-surface-400);
}
</style>
