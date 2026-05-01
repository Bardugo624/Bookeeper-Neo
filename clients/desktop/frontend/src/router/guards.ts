/**
 * router/guards.ts
 *
 * Guard globali del router. Responsabilità:
 *  - Re-direct verso /login se l'utente apre una route protetta senza
 *    sessione attiva.
 *  - Re-direct verso la home (o `?redirect=...`) se l'utente apre /login
 *    mentre è già autenticato.
 *  - Imposta document.title in base a route.meta.title.
 *
 * Si appoggia a useAuthStore() per leggere isAuthenticated.
 */

import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const APP_NAME = 'Bookeeper'

export function registerGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    // Garantisce di aver letto la sessione prima del primo redirect.
    if (!auth.restored) await auth.restore()

    const isPublic = to.meta.public === true

    if (!isPublic && !auth.isAuthenticated) {
      return {
        name: 'login',
        query: { redirect: to.fullPath },
      }
    }

    if (isPublic && auth.isAuthenticated && to.name === 'login') {
      const target = (to.query.redirect as string | undefined) ?? '/'
      return target
    }

    return true
  })

  router.afterEach((to) => {
    const title = to.meta.title as string | undefined
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  })
}
