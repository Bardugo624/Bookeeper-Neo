/**
 * stores/auth.ts
 *
 * Stato di autenticazione globale. Single source of truth per il router
 * guard, l'AppShell e la LoginView.
 *
 * Lo store NON tiene segreti (cert / token / password) — questi vivono
 * lato Go. Tiene solo metadati: serverURL, email, deviceID, isAuthenticated.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authEndpoints } from '@/lib/api/endpoints/auth'
import type {
  BootstrapInput,
  LoginInput,
  SessionInfo,
  SetupTenantInput,
  SetupTenantResult,
} from '@/lib/keystore'

const EMPTY: SessionInfo = {
  has_session: false,
  server_url: '',
  email: '',
  user_id: '',
  tenant_id: '',
  device_id: '',
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<SessionInfo>({ ...EMPTY })
  const restoring = ref(false)
  const restored = ref(false)
  const lastError = ref<string | null>(null)

  const isAuthenticated = computed(() => session.value.has_session)
  const serverURL = computed(() => session.value.server_url)
  const email = computed(() => session.value.email)

  function update(s: SessionInfo) {
    session.value = { ...EMPTY, ...s }
  }

  /**
   * Carica la sessione persistita lato Go all'avvio dell'app.
   * Idempotente: chiamare una volta in main.ts prima di app.mount.
   */
  async function restore() {
    if (restored.value || restoring.value) return
    restoring.value = true
    try {
      update(await authEndpoints.session())
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
    } finally {
      restoring.value = false
      restored.value = true
    }
  }

  async function bootstrap(input: BootstrapInput) {
    lastError.value = null
    try {
      update(await authEndpoints.bootstrap(input))
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  /**
   * Crea un nuovo tenant + utente owner sul server. Non logga il device:
   * il chiamante deve poi invocare bootstrap() con l'invite_code restituito.
   */
  async function setupTenant(input: SetupTenantInput): Promise<SetupTenantResult> {
    lastError.value = null
    try {
      return await authEndpoints.setupTenant(input)
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  async function login(input: LoginInput) {
    lastError.value = null
    try {
      update(await authEndpoints.login(input))
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  /** Logout "soft": butta i token, mantiene il cert per re-login rapido. */
  async function logout() {
    try {
      await authEndpoints.logout()
    } catch {
      /* best effort */
    }
    update(await authEndpoints.session())
  }

  /** Wipe "hard": cancella cert+chiave. Forza nuovo pairing. */
  async function wipe() {
    await authEndpoints.wipe()
    update({ ...EMPTY })
  }

  return {
    session,
    isAuthenticated,
    serverURL,
    email,
    restoring,
    restored,
    lastError,
    restore,
    bootstrap,
    setupTenant,
    login,
    logout,
    wipe,
  }
})
