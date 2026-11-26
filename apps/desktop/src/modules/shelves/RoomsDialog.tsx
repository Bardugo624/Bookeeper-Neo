import { useState, type FormEvent } from 'react';
import type { RoomOut } from '@bookeeper/api';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ConfirmDialog, apiErrorMessage } from '../../kit';
import { RoomRow } from './RoomRow';
import { ROOM_NAME_MAX, roomErrorMessage, roomNameProblem } from './roomModel';
import { useRoomWrites } from './useRooms';
import styles from './RoomsDialog.module.css';

export interface RoomsDialogProps {
  rooms: RoomOut[];
  /** Called with a room id once it is deleted, so a filter on it can be dropped. */
  onDeleted(id: string): void;
  onClose(): void;
}

/** "Rooms…": the list with how many cabinets each holds, add, rename in place and delete. */
export function RoomsDialog({ rooms, onDeleted, onClose }: RoomsDialogProps) {
  const t = useT();
  const writes = useRoomWrites();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<RoomOut | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const problem = roomNameProblem(name);
    if (problem) return setError(t(`shelves.rooms.errors.${problem}`, { max: ROOM_NAME_MAX }));
    try {
      await writes.create.mutateAsync({ name: name.trim() });
      setName('');
      setError(null);
    } catch (e) {
      setError(roomErrorMessage(t, e));
    }
  };

  const confirmDelete = async (room: RoomOut) => {
    try {
      await writes.remove.mutateAsync(room.id);
      onDeleted(room.id);
      setDoomed(null);
      setDeleteError(null);
    } catch (e) {
      setDeleteError(apiErrorMessage(t, e));
      setDoomed(null);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()} title={t('shelves.rooms.title')} closeLabel={t('common.close')}>
        <div className={styles.body}>
          {deleteError ? (
            <p role="alert" className={styles.error}>
              {deleteError}
            </p>
          ) : null}
          {rooms.length === 0 ? (
            <p className={styles.empty}>{t('shelves.rooms.empty')}</p>
          ) : (
            <ul className={styles.list} aria-label={t('shelves.rooms.title')}>
              {rooms.map((room) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  busy={writes.update.isPending}
                  rename={(r, next) => writes.update.mutateAsync({ id: r.id, patch: { name: next } })}
                  onDelete={setDoomed}
                />
              ))}
            </ul>
          )}
          <form className={styles.add} onSubmit={(e) => void add(e)} noValidate>
            <Field label={t('shelves.rooms.newName')} error={error ?? undefined}>
              <Input
                value={name}
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Button type="submit" variant="primary" icon="plus" loading={writes.create.isPending} loadingLabel={t('common.saving')}>
              {t('shelves.rooms.add')}
            </Button>
          </form>
        </div>
      </Dialog>
      <ConfirmDialog
        open={doomed !== null}
        title={t('shelves.rooms.deleteTitle')}
        description={doomed ? t('shelves.rooms.deleteText', { name: doomed.name }) : ''}
        confirmLabel={t('common.delete')}
        tone="danger"
        busy={writes.remove.isPending}
        onConfirm={() => doomed && void confirmDelete(doomed)}
        onCancel={() => setDoomed(null)}
      />
    </>
  );
}
