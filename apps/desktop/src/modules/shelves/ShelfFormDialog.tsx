import { Field, Input } from '@bookeeper/ui/base';
import type { RoomOut, ShelfOut } from '@bookeeper/api';
import { useT } from '../../app';
import { tourAnchor } from '../tour';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { ColorPicker } from './ColorPicker';
import { EMPTY_VALUES, validateShelf, valuesOf, type ShelfValues } from './formModel';
import { LIMITS } from './model';
import { RoomField } from './RoomField';
import { ROOM_NAME_MAX, isRoomExists } from './roomModel';
import styles from './ShelfFormDialog.module.css';

export interface ShelfFormDialogProps {
  /** The unit to edit; absent when creating. */
  shelf?: ShelfOut;
  /** The rooms to choose from. */
  rooms: RoomOut[];
  save(values: ShelfValues): Promise<unknown>;
  onClose(): void;
}

/** New / edit unit. Mounted only while open, so each opening starts from fresh values. */
export function ShelfFormDialog({ shelf, rooms, save, onClose }: ShelfFormDialogProps) {
  const t = useT();
  const form = useFormState<ShelfValues>(shelf ? valuesOf(shelf) : EMPTY_VALUES, validateShelf);
  const { values, errors, touched } = form;
  const vars = { minRows: LIMITS.minRows, minSlots: LIMITS.minSlots };
  // The number a message pluralizes on (`count`) is the limit it names last.
  const counts: Record<string, number> = { tooLong: LIMITS.name, roomTooLong: ROOM_NAME_MAX, rows: LIMITS.maxRows, slots: LIMITS.maxSlots };
  const message = (name: keyof ShelfValues) => {
    const code = errors[name];
    return touched[name] && code ? t(`shelves.form.errors.${code}`, { ...vars, count: counts[code] ?? 0 }) : undefined;
  };
  const text = (name: 'name' | 'rows' | 'slots_per_row') => ({
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) => form.setValue(name, e.target.value),
  });

  const submit = form.submit(async (v) => {
    try {
      await save(v);
    } catch (e) {
      if (!isRoomExists(e)) throw e;
      form.setErrors({ newRoom: 'exists' });
      return;
    }
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
        <Input {...text('name')} {...(shelf ? {} : tourAnchor('shelf.form'))} required autoComplete="off" />
      </Field>
      <RoomField
        rooms={rooms}
        room={values.room}
        newRoom={values.newRoom}
        error={message('newRoom')}
        onRoom={(room) => form.setValue('room', room)}
        onNewRoom={(name) => form.setValue('newRoom', name)}
      />
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
