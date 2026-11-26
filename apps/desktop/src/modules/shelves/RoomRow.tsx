import { useState, type FormEvent } from 'react';
import type { RoomOut } from '@bookeeper/api';
import { Button, Field, IconButton, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { roomErrorMessage, roomNameProblem, ROOM_NAME_MAX } from './roomModel';
import styles from './RoomsDialog.module.css';

export interface RoomRowProps {
  room: RoomOut;
  busy: boolean;
  rename(room: RoomOut, name: string): Promise<unknown>;
  onDelete(room: RoomOut): void;
}

/** One room: its name and cabinet count, with rename in place and delete. */
export function RoomRow({ room, busy, rename, onDelete }: RoomRowProps) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = () => {
    setDraft(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null) return;
    const problem = roomNameProblem(draft);
    if (problem) return setError(t(`shelves.rooms.errors.${problem}`, { count: ROOM_NAME_MAX }));
    if (draft.trim() === room.name) return stop();
    try {
      await rename(room, draft.trim());
      stop();
    } catch (e) {
      setError(roomErrorMessage(t, e));
    }
  };

  if (draft !== null) {
    return (
      <li className={styles.row}>
        <form className={styles.edit} onSubmit={(e) => void submit(e)} noValidate>
          <Field label={t('shelves.rooms.renameLabel', { name: room.name })} error={error ?? undefined}>
            <Input
              value={draft}
              autoFocus
              autoComplete="off"
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" size="sm" loading={busy} loadingLabel={t('common.saving')}>
              {t('common.save')}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={stop}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className={styles.row}>
      <span className={styles.name}>{room.name}</span>
      <span className={styles.count}>{t('shelves.rooms.shelves', { count: room.shelf_count })}</span>
      <IconButton icon="pencil" size="sm" label={t('shelves.rooms.rename', { name: room.name })} onClick={() => setDraft(room.name)} />
      <IconButton icon="trash" size="sm" tone="danger" label={t('shelves.rooms.delete', { name: room.name })} onClick={() => onDelete(room)} />
    </li>
  );
}
