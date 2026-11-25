import { Field, Input } from '@bookeeper/ui/base';
import type { DeviceOut } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { LIMITS, validateName, type RenameValues } from './model';

export interface RenameDialogProps {
  device: DeviceOut;
  save(name: string): Promise<unknown>;
  onClose(): void;
}

/** Mounted only while open, so every opening starts from the current name. */
export function RenameDialog({ device, save, onClose }: RenameDialogProps) {
  const t = useT();
  const form = useFormState<RenameValues>({ name: device.name }, validateName);
  const key = form.errors.name;
  const submit = form.submit(async (v) => {
    await save(v.name);
    onClose();
  });

  return (
    <FormDialog
      open
      title={t('devices.rename.title')}
      error={form.submitError ? apiErrorMessage(t, form.submitError) : null}
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <Field label={t('devices.rename.field')} error={form.touched.name && key ? t(`devices.rename.errors.${key}`, { max: LIMITS.name }) : undefined}>
        <Input name="name" value={form.values.name} autoComplete="off" required onChange={(e) => form.setValue('name', e.target.value)} />
      </Field>
    </FormDialog>
  );
}
