import type { components } from './schema';
import type { Transport } from './transport';
import { P, unwrap, unwrapEmpty } from './resources/util';
import { booksApi } from './resources/books';
import { shelvesApi } from './resources/shelves';
import { loansApi } from './resources/loans';
import { wishlistApi } from './resources/wishlist';
import { statsApi } from './resources/stats';

export type Health = components['schemas']['Health'];

type S = components['schemas'];
export type AuthOut = S['AuthOut'];
export type Session = S['Session'];
export type DeviceOut = S['DeviceOut'];
export type LibraryOut = S['LibraryOut'];
export type UserOut = S['UserOut'];
export type SetupStatus = S['SetupStatus'];
export type SetupRequest = S['SetupRequest'];
export type LoginRequest = S['LoginRequest'];
export type LibrariesRequest = S['LibrariesRequest'];
export type LibrariesOut = S['LibrariesOut'];
export type PasswordRequest = S['PasswordRequest'];
export type RedeemRequest = S['RedeemRequest'];
export type RefreshOut = S['RefreshOut'];
export type MeOut = S['MeOut'];
export type PairingCode = S['PairingCode'];
export type DeviceList = S['DeviceList'];

export function createClient(t: Transport) {
  return {
    ...booksApi(t),
    ...shelvesApi(t),
    ...loansApi(t),
    ...wishlistApi(t),
    ...statsApi(t),
    async health() {
      return unwrap<Health>(await t.request('GET', `${P}/health`));
    },
    async setupStatus() {
      return unwrap<SetupStatus>(await t.request('GET', `${P}/setup`));
    },
    async setup(body: SetupRequest) {
      return unwrap<AuthOut>(await t.request('POST', `${P}/setup`, body));
    },
    async login(body: LoginRequest) {
      return unwrap<AuthOut>(await t.request('POST', `${P}/auth/login`, body));
    },
    async libraries(body: LibrariesRequest) {
      return unwrap<LibrariesOut>(await t.request('POST', `${P}/auth/libraries`, body));
    },
    async refresh(refreshToken: string) {
      return unwrap<RefreshOut>(await t.request('POST', `${P}/auth/refresh`, { refresh_token: refreshToken }));
    },
    async logout() {
      unwrapEmpty(await t.request('POST', `${P}/auth/logout`));
    },
    async setPassword(body: PasswordRequest) {
      unwrapEmpty(await t.request('POST', `${P}/auth/password`, body));
    },
    async me() {
      return unwrap<MeOut>(await t.request('GET', `${P}/me`));
    },
    async createPairingCode() {
      return unwrap<PairingCode>(await t.request('POST', `${P}/pairing/codes`));
    },
    async redeemPairingCode(body: RedeemRequest) {
      return unwrap<AuthOut>(await t.request('POST', `${P}/pairing/redeem`, body));
    },
    async listDevices() {
      return unwrap<DeviceList>(await t.request('GET', `${P}/devices`));
    },
    async renameDevice(id: string, name: string) {
      return unwrap<DeviceOut>(await t.request('PATCH', `${P}/devices/${encodeURIComponent(id)}`, { name }));
    },
    async revokeDevice(id: string) {
      unwrapEmpty(await t.request('POST', `${P}/devices/${encodeURIComponent(id)}/revoke`));
    },
  };
}
