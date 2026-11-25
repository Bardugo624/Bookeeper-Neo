import { P, S, enc, unwrap, unwrapEmpty, type Transport } from './util';

export type RoomOut = S['RoomOut'];
export type RoomList = S['RoomList'];
export type RoomSummary = S['RoomSummary'];
export type CreateRoom = S['CreateRoom'];
export type PatchRoom = S['PatchRoom'];

export function roomsApi(t: Transport) {
  return {
    async listRooms() {
      return unwrap<RoomList>(await t.request('GET', `${P}/rooms`));
    },
    async createRoom(body: CreateRoom) {
      return unwrap<RoomOut>(await t.request('POST', `${P}/rooms`, body));
    },
    async updateRoom(id: string, patch: PatchRoom) {
      return unwrap<RoomOut>(await t.request('PATCH', `${P}/rooms/${enc(id)}`, patch));
    },
    async deleteRoom(id: string) {
      unwrapEmpty(await t.request('DELETE', `${P}/rooms/${enc(id)}`));
    },
  };
}
