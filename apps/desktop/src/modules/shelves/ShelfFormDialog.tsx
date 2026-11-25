import { Field, Input } from '@bookeeper/ui/base';
import type { ShelfOut } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { ColorPicker } from './ColorPicker';
import { EMPTY_VALUES, validateShelf, valuesOf, type ShelfValues } from './formModel';
import { LIMITS } from './model';
import styles from './ShelfFormDialog.module.css';

export interface ShelfFormDialogProps {
  /** The unit to edit; absent when creating. */
  shelf?: ShelfOut;
  save(values: ShelfValues): Promise<unknown>;
  onClose(): void;
}

/** New / edit unit. Mounted only while open, so each opening starts from fresh values. */
export function ShelfFormDialog({ shelf, save, onClose }: ShelfFormDialogProps) {
  const t = useT();
  const form = useFormState<ShelfValues>(shelf ? valuesOf(shelf) : EMPTY_VALUES, validateShelf);
  const { values, errors, touched } = form;
  const vars = { max: LIMITS.name, minRows: LIMITS.minRows, maxRows: LIMITS.maxRows, minSlots: LIMITS.minSlots, maxSlots: LIMITS.maxSlots };
  const message = (name: keyof ShelfValues) =>
    touched[name] && errors[name] ? t(`shelves.form.errors.${errors[name]}`, vars) : undefined;
  const text = (name: 'name' | 'rows' | 'slots_per_row') => ({
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) => form.setValue(name, e.target.value),
  });

  const submit = form.submit(async (v) => {
    await save(v);
    onClose();
  });

  return (
    <FormDialog
      open
      title={t(shelf ? 'shelves.form.editTitle' : 'shelves.form.newTitle')}
      error={
        form.submitError
          ? apiErrorMessage(t, form.submitError, { shelf_too_small: t('shelves.form.errors.tooSmall') })
          : null
      }
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <Field label={t('shelves.form.name')} error={message('name')}>
        <Input {...text('name')} required autoComplete="off" />
      </Field>
      <div className={styles.field}>
        <span className={styles.label}>{t('shelves.form.color')}</span>
        <ColorPicker value={values.color} onChange={(c) => form.setValue('color', c)} />
      </div>
      <div className={styles.pair}>
        <Field label={t('shelves.form.rows')} error={message('rows')}>
          <Input {...text('rows')} type="number" inputMode="numeric" min={LIMITS.minRows} max={LIMITS.maxRows} />
        </Field>
        <Field label={t('shelves.form.slots')} description={t('shelves.form.slotsHint')} error={message('slots_per_row')}>
          <Input {...text('slots_per_row')} type="number" inputMode="numeric" min={LIMITS.minSlots} max={LIMITS.maxSlots} />
        </Field>
      </div>
    </FormDialog>
  );
}
