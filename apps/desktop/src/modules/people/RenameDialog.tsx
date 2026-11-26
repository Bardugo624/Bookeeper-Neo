import { Field, Input } from '@bookeeper/ui/base';
import type { PersonOut } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { LIMITS, validateName, type NameValues } from './model';

export interface RenameDialogProps {
  person: PersonOut;
  save(name: string): Promise<unknown>;
  onClose(): void;
}

/** Mounted only while open, so every opening starts from the current name. */
export function RenameDialog({ person, save, onClose }: RenameDialogProps) {
  const t = useT();
  const form = useFormState<NameValues>({ name: person.display_name }, validateName);
  const key = form.errors.name;
  const submit = form.submit(async (v) => {
    await save(v.name.trim());
    onClose();
  });

  return (
    <FormDialog
      open
      title={t('people.rename.title')}
      error={form.submitError ? apiErrorMessage(t, form.submitError) : null}
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <Field label={t('people.rename.field')} error={form.touched.name && key ? t(`people.rename.errors.${key}`, { max: LIMITS.name }) : undefined}>
        <Input name="name" value={form.values.name} autoComplete="off" required onChange={(e) => form.setValue('name', e.target.value)} />
      </Field>
    </FormDialog>
  );
}
