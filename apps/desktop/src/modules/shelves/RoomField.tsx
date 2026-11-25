import type { RoomOut } from '@bookeeper/api';
import { Field, Input } from '@bookeeper/ui/base';
import { Select } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { NEW_ROOM, NO_ROOM, ROOM_NAME_MAX } from './roomModel';

export interface RoomFieldProps {
  rooms: RoomOut[];
  room: string;
  newRoom: string;
  /** Message beside the new-room name. */
  error?: string;
  onRoom(value: string): void;
  onNewRoom(value: string): void;
}

/** The room of a cabinet: one of the rooms, none, or a new one made when the form is saved. */
export function RoomField({ rooms, room, newRoom, error, onRoom, onNewRoom }: RoomFieldProps) {
  const t = useT();
  const options = [
    { value: NO_ROOM, label: t('shelves.form.noRoom') },
    ...rooms.map((r) => ({ value: r.id, label: r.name })),
    { value: NEW_ROOM, label: t('shelves.form.createRoom') },
  ];
  return (
    <>
      <Field label={t('shelves.form.room')}>
        <Select options={options} value={room} onValueChange={onRoom} />
      </Field>
      {room === NEW_ROOM ? (
        <Field label={t('shelves.form.newRoomName')} error={error}>
          <Input
            name="newRoom"
            value={newRoom}
            maxLength={ROOM_NAME_MAX * 2}
            autoComplete="off"
            onChange={(e) => onNewRoom(e.target.value)}
          />
        </Field>
      ) : null}
    </>
  );
}
