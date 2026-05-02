/**
 * lib/api/endpoints/auth.ts
 *
 * Endpoint di autenticazione del backend Bookeeper. Sono thin wrappers
 * sopra `keystore` perché la logica vera è lato Go (mTLS + persist),
 * ma li teniamo separati per dare uniformità con gli altri endpoint
 * (books, loans, ...) che invece useranno `api.get/post/...`.
 */

import {
  keystore,
  type BootstrapInput,
  type LoginInput,
  type RecoverInviteInput,
  type RecoverInviteResult,
  type SessionInfo,
  type SetupTenantInput,
  type SetupTenantResult,
} from '../../keystore'

export const authEndpoints = {
  setupTenant: (input: SetupTenantInput): Promise<SetupTenantResult> => keystore.setupTenant(input),
  bootstrap: (input: BootstrapInput): Promise<SessionInfo> => keystore.bootstrap(input),
  login: (input: LoginInput): Promise<SessionInfo> => keystore.login(input),
  logout: (): Promise<void> => keystore.logout(),
  wipe: (): Promise<void> => keystore.wipe(),
  session: (): Promise<SessionInfo> => keystore.getSession(),
  whoAmI: () => keystore.whoAmI(),
  recoverInvite: (input: RecoverInviteInput): Promise<RecoverInviteResult> =>
    keystore.recoverInvite(input),
}
