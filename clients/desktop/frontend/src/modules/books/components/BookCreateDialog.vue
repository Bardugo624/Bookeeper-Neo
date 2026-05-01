<script setup lang="ts">
/**
 * BookCreateDialog — modale per inserire un nuovo libro.
 * Usa useBookForm + BookFormFields. Emette `created(id)` al successo.
 */
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import BookFormFields from './BookFormFields.vue';
import { useBookForm } from '../composables/useBookForm';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'created', id: string): void;
}>();

const { form, authorsRaw, submitError, submit, reset } = useBookForm(null);
const submitting = ref(false);

watch(
  () => props.visible,
  (v) => {
    if (v) reset(null);
  },
);

async function onSave(): Promise<void> {
  submitting.value = true;
  try {
    const id = await submit();
    emit('created', id);
    emit('update:visible', false);
  } catch {
    // submitError già popolato dal composable
  } finally {
    submitting.value = false;
  }
}

function close(): void {
  if (!submitting.value) emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v) => emit('update:visible', v)"
    modal
    header="Nuovo libro"
    :style="{ width: 'min(720px, 92vw)' }"
    :closable="!submitting"
  >
    <BookFormFields
      :form="form"
      :authors-raw="authorsRaw"
      :error-message="submitError"
      @update:form="(v) => Object.assign(form, v)"
      @update:authors-raw="(v) => (authorsRaw = v)"
    />
    <template #footer>
      <Button label="Annulla" severity="secondary" text :disabled="submitting" @click="close" />
      <Button
        label="Salva"
        icon="pi pi-check"
        :loading="submitting"
        :disabled="!form.title.trim()"
        @click="onSave"
      />
    </template>
  </Dialog>
</template>
