import { Button, DangerAction, DangerZone, Field, Input, Textarea } from '@bookeeper/ui/base';
import { Select } from '@bookeeper/ui/overlays';
import type { WishOut } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { EMPTY_VALUES, LIMITS, PRIORITIES, validateWish, valuesOf, type WishValues } from './model';

export interface WishFormDialogProps {
  /** The wish to edit; absent when adding. */
  wish?: WishOut;
  save(values: WishValues): Promise<unknown>;
  /** Opens the delete confirmation; the danger zone shows only when editing and this is given. */
  onDelete?(): void;
  onClose(): void;
}

const MAX: Partial<Record<keyof WishValues, number>> = {
  title: LIMITS.title,
  authors: LIMITS.authors,
  isbn: LIMITS.isbn,
  source_url: LIMITS.sourceUrl,
  notes: LIMITS.notes,
};

/** Add / edit form. Mounted only while open, so every opening starts from fresh values. */
export function WishFormDialog({ wish, save, onDelete, onClose }: WishFormDialogProps) {
  const t = useT();
  const form = useFormState<WishValues>(wish ? valuesOf(wish) : EMPTY_VALUES, validateWish);
  const { values, errors, touched } = form;

  const message = (name: keyof WishValues) => {
    const key = errors[name];
    return touched[name] && key ? t(`wishlist.form.errors.${key}`, { max: MAX[name] ?? 0 }) : undefined;
  };
  const text = (name: Exclude<keyof WishValues, 'priority'>) => ({
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
      title={t(wish ? 'wishlist.form.editTitle' : 'wishlist.form.addTitle')}
      error={form.submitError ? apiErrorMessage(t, form.submitError) : null}
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <Field label={t('wishlist.form.title')} error={message('title')}>
        <Input {...text('title')} required autoComplete="off" />
      </Field>
      <Field label={t('wishlist.form.authors')} description={t('wishlist.form.authorsHint')} error={message('authors')}>
        <Input {...text('authors')} autoComplete="off" />
      </Field>
      <Field label={t('wishlist.form.isbn')} error={message('isbn')}>
        <Input {...text('isbn')} autoComplete="off" />
      </Field>
      <Field label={t('wishlist.form.priority')}>
        <Select
          value={values.priority}
          onValueChange={(v) => form.setValue('priority', v)}
          options={PRIORITIES.map((p, i) => ({ value: String(i), label: t(`wishlist.priority.${p}`) }))}
        />
      </Field>
      <Field label={t('wishlist.form.sourceUrl')} error={message('source_url')}>
        <Input {...text('source_url')} type="url" inputMode="url" autoComplete="off" />
      </Field>
      <Field label={t('wishlist.form.notes')} error={message('notes')}>
        <Textarea {...text('notes')} rows={3} />
      </Field>
      {wish && onDelete ? (
        <DangerZone title={t('wishlist.danger.title')} headingLevel="h3">
          <DangerAction
            title={t('wishlist.danger.delete.title')}
            consequence={t('wishlist.danger.delete.consequence')}
            action={
              <Button variant="danger" size="sm" icon="trash" disabled={form.submitting} onClick={onDelete}>
                {t('common.delete')}
              </Button>
            }
          />
        </DangerZone>
      ) : null}
    </FormDialog>
  );
}
