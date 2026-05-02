/**
 * lib/keystore.ts
 *
 * Wrapper TypeScript sopra i bindings di sessione del backend Wails.
 * Espone le sole operazioni di lifecycle dell'identità crittografica:
 * lettura stato, bootstrap, login mTLS, logout, wipe.
 *
 * Tutto il materiale segreto (cert + chiave + CA) vive lato Go (filesystem
 * con permessi 0600); qui passano solo metadati non-sensibili (email,
 * deviceID, serverURL).
 */

import {
  GetSession,
  BootstrapDesktop,
  Login,
  Logout,
  WipeIdentity,
  WhoAmI,
  SetupTenant,
  ReloadTrust,
  RecoverInvite,
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

export type SessionInfo = main.SessionInfo
export type SetupTenantResult = main.SetupTenantResp
export type RecoverInviteResult = main.RecoverInviteResp

export interface BootstrapInput {
  serverUrl: string
  bootstrapUrl?: string
  inviteCode: string
  email: string
  password: string
  adminPassword: string
  deviceName?: string
}

export interface LoginInput {
  email: string
  password: string
  /**
   * Quando true (default), i tokens JWT vengono persistiti su disco e
   * sopravvivono al riavvio dell'app ("ricordami su questo dispositivo").
   * Quando false, vivono solo in memoria: alla chiusura l'utente dovrà
   * ri-fare login (il cert resta, niente nuovo pairing).
   */
  persist?: boolean
}

export interface SetupTenantInput {
  serverUrl: string
  bootstrapUrl?: string
  tenantName: string
  adminPassword: string
  ownerEmail: string
  ownerName: string
  ownerPassword: string
}

export interface ReloadTrustInput {
  bootstrapUrl?: string
  tenantId?: string
  adminPassword: string
}

export interface RecoverInviteInput {
  serverUrl: string
  bootstrapUrl?: string
  tenantName: string
  adminPassword: string
}

export const keystore = {
  /** Stato corrente della sessione (has_session = false se nessun cert). */
  getSession: (): Promise<SessionInfo> => GetSession(),

  /** Crea il tenant + utente owner (chiama /setup/tenant non-mTLS). */
  setupTenant: (input: SetupTenantInput): Promise<SetupTenantResult> =>
    SetupTenant(
      new main.SetupTenantReq({
        server_url: input.serverUrl,
        bootstrap_url: input.bootstrapUrl ?? '',
        tenant_name: input.tenantName,
        admin_password: input.adminPassword,
        owner_email: input.ownerEmail,
        owner_name: input.ownerName,
        owner_password: input.ownerPassword,
      }),
    ),

  /** Pairing del dispositivo: genera CSR, ottiene cert, persiste tutto. */
  bootstrap: (input: BootstrapInput): Promise<SessionInfo> =>
    BootstrapDesktop(
      new main.BootstrapDesktopReq({
        server_url: input.serverUrl,
        bootstrap_url: input.bootstrapUrl ?? '',
        invite_code: input.inviteCode,
        email: input.email,
        password: input.password,
        admin_password: input.adminPassword,
        device_name: input.deviceName ?? '',
      }),
    ),

  /** Login mTLS: richiede una sessione preesistente (cert già paired). */
  login: (input: LoginInput): Promise<SessionInfo> =>
    Login(new main.LoginReq({
      email: input.email,
      password: input.password,
      persist: input.persist ?? true,
    })),

  /** Logout best-effort: tiene il cert, butta i token. */
  logout: (): Promise<void> => Logout(),

  /** Wipe completo: cancella cert+chiave+token. Richiederà nuovo pairing. */
  wipe: (): Promise<void> => WipeIdentity(),

  /** Verifica round-trip mTLS chiamando /api/v1/me. */
  whoAmI: (): Promise<Record<string, unknown>> => WhoAmI(),

  /**
   * Forza Caddy a ricaricare la trust pool (pulsante d'emergenza quando
   * il reload automatico post-CreateTenant non e andato a buon fine e i
   * cert nuovi vengono rifiutati con EOF in mTLS).
   */
  reloadTrust: (input: ReloadTrustInput): Promise<void> =>
    ReloadTrust(
      new main.ReloadTrustReq({
        bootstrap_url: input.bootstrapUrl ?? '',
        tenant_id: input.tenantId ?? '',
        admin_password: input.adminPassword,
      }),
    ),

  /**
   * Rigenera l'invite_code conoscendo solo nome tenant + admin_password.
   * Va sulla porta bootstrap (no mTLS) perche' tipicamente l'utente che
   * lo usa NON ha un cert valido (e' "chiuso fuori" dal proprio tenant).
   */
  recoverInvite: (input: RecoverInviteInput): Promise<RecoverInviteResult> =>
    RecoverInvite(
      new main.RecoverInviteReq({
        server_url: input.serverUrl,
        bootstrap_url: input.bootstrapUrl ?? '',
        tenant_name: input.tenantName,
        admin_password: input.adminPassword,
      }),
    ),
}
