<script setup lang="ts">
// LoginView — wizard a passi con morphing.
//
// UX: due schermi.
//   1. WELCOME — scelta del percorso con card chiare (niente form misto):
//        · login   — "Bentornato" (solo se c'è già un cert paired)
//        · local   — "Crea la tua libreria su questo computer" (one-click)
//        · remote  — "Crea su un server" (setup remoto + pairing automatico)
//        · pair    — "Unisciti a una libreria esistente" (pairing)
//   2. FORM — SOLO i campi del percorso scelto, con hint inline.
//
// Morphing: i cambi di schermo passano da document.startViewTransition
// quando disponibile (WebView2/Chromium sì): la card scelta si trasforma
// nell'intestazione del form via view-transition-name. Fallback: swap
// istantaneo. prefers-reduced-motion salta del tutto la coreografia.
//
// i18n: tutte le stringhe vengono da src/i18n (it/en); i computed che
// le usano sono reattivi al cambio lingua.
//
// La logica di autenticazione è nello store auth: setupLocal,
// setupTenant→bootstrap concatenati, bootstrap, login, recoverInvite.

import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Checkbox from 'primevue/checkbox';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import './LoginView.css';

type Path = 'login' | 'local' | 'remote' | 'pair';
type Step = 'welcome' | 'form';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const ui = useUiStore();
const { t } = useI18n();

const hasCert = computed(() => auth.session.has_cert);

const step = ref<Step>(hasCert.value ? 'form' : 'welcome');
const path = ref<Path>(hasCert.value ? 'login' : 'local');

// ---- Morph helper ---------------------------------------------------------
// Esegue la mutazione di stato dentro una View Transition (se supportata e
// se l'utente non preferisce reduced-motion), così il browser fa il morph
// tra vecchio e nuovo DOM. La card scelta e il chip di intestazione
// condividono il view-transition-name → morphing dell'elemento.
const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

function withMorph(mutate: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => Promise<void>) => unknown;
  };
  if (!doc.startViewTransition || reducedMotion()) {
    mutate();
    return;
  }
  doc.startViewTransition(async () => {
    mutate();
    await nextTick();
  });
}

// ---- Percorsi -------------------------------------------------------------

interface PathCard {
  id: Path;
  icon: string;
  title: string;
  desc: string;
}
const pathCards = computed<PathCard[]>(() => {
  const cards: PathCard[] = [];
  if (hasCert.value) {
    cards.push({
      id: 'login',
      icon: 'pi pi-sign-in',
      title: t('login.path.loginTitle'),
      desc: auth.session.email
        ? t('login.path.loginDesc', { email: auth.session.email })
        : t('login.path.loginDescNoEmail'),
    });
  }
  cards.push(
    {
      id: 'local',
      icon: 'pi pi-desktop',
      title: t('login.path.localTitle'),
      desc: t('login.path.localDesc'),
    },
    {
      id: 'remote',
      icon: 'pi pi-server',
      title: t('login.path.remoteTitle'),
      desc: t('login.path.remoteDesc'),
    },
    {
      id: 'pair',
      icon: 'pi pi-key',
      title: t('login.path.pairTitle'),
      desc: t('login.path.pairDesc'),
    },
  );
  return cards;
});

const activeCard = computed(() => pathCards.value.find((c) => c.id === path.value));

function choosePath(p: Path) {
  clearErrors();
  submitError.value = null;
  withMorph(() => {
    path.value = p;
    step.value = 'form';
  });
}
function goWelcome() {
  clearErrors();
  submitError.value = null;
  setupResult.value = null;
  withMorph(() => {
    step.value = 'welcome';
  });
}

// ---- Stato form -----------------------------------------------------------

interface FormState {
  serverUrl: string;
  bootstrapUrl: string;
  tenantName: string;
  ownerName: string;
  inviteCode: string;
  adminPassword: string;
  deviceName: string;
  email: string;
  password: string;
  remember: boolean;
}

const form = reactive<FormState>({
  serverUrl: 'https://bookeeper.albacremisi.org',
  bootstrapUrl: '',
  tenantName: '',
  ownerName: '',
  inviteCode: '',
  adminPassword: '',
  deviceName: '',
  email: '',
  password: '',
  remember: true,
});

const errors = reactive<Partial<Record<keyof FormState, string>>>({});
const submitError = ref<string | null>(null);
// Notice (info/warn) separato dall'errore di submit: "sessione scaduta",
// "disconnesso". Ambra/azzurro, non rosso: non è un fallimento del form.
interface LoginNotice { kind: 'info' | 'warn'; icon: string; key: string }
const notice = ref<LoginNotice | null>(null);
const submitting = ref(false);
// success: il bottone si trasforma in conferma prima del redirect.
const success = ref(false);

// Banner dopo un setup remoto riuscito ma pairing automatico fallito:
// l'utente atterra su PAIR precompilato e può copiarsi l'invite.
const setupResult = ref<{ inviteCode: string; tenantId: string } | null>(null);

// Recovery codice invito (percorso pair).
const recoveryOpen = ref(false);
const recoveryForm = reactive({ tenantName: '', adminPassword: '' });
const recoveryError = ref<string | null>(null);
const recoverySuccess = ref<string | null>(null);
const recoveryLoading = ref(false);

// Ref al <details> del Bootstrap URL: aperto programmaticamente quando
// l'errore indica un host mTLS-only.
const bootstrapDetails = ref<HTMLDetailsElement | null>(null);

const themeIcon = computed(() => {
  if (ui.mode === 'system') return 'pi pi-desktop';
  return ui.isDark ? 'pi pi-sun' : 'pi pi-moon';
});

// Se il cert sparisce (wipe) mentre siamo sul form di login, torna alla
// scelta percorsi: il login senza cert fallirebbe comunque.
watch(hasCert, (v) => {
  if (!v && path.value === 'login') {
    step.value = 'welcome';
    path.value = 'local';
  }
});

// Banner da query (?expired=1 / ?loggedout=1).
if (route.query.expired === '1') {
  notice.value = { kind: 'warn', icon: 'pi pi-clock', key: 'login.notice.expired' };
} else if (route.query.loggedout === '1') {
  notice.value = { kind: 'info', icon: 'pi pi-sign-out', key: 'login.notice.loggedOut' };
}
if (auth.session.email) form.email = auth.session.email;
if (auth.serverURL) form.serverUrl = auth.serverURL;

// Deep-link a un percorso specifico (?path=local|remote|pair): apre il
// form direttamente, senza passare dalla scelta.
{
  const qp = route.query.path as string | undefined;
  if (qp === 'local' || qp === 'remote' || qp === 'pair') {
    path.value = qp;
    step.value = 'form';
  }
}

// ---- Validazione ----------------------------------------------------------

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clearErrors() {
  for (const k of Object.keys(errors) as (keyof FormState)[]) errors[k] = '';
}

// Gli errori di campo si spengono appena l'utente corregge.
watch(
  () => ({ ...form }),
  (n, o) => {
    for (const k of Object.keys(errors) as (keyof FormState)[]) {
      if (errors[k] && n[k] !== o[k]) errors[k] = '';
    }
  },
  { deep: false },
);

function validate(): boolean {
  clearErrors();
  let ok = true;
  const p = path.value;

  if (!EMAIL_RE.test(form.email)) { errors.email = t('login.field.emailError'); ok = false; }
  if (form.password.length < 8) { errors.password = t('login.field.passwordError'); ok = false; }

  if (p === 'remote' || p === 'pair') {
    if (!URL_RE.test(form.serverUrl.trim())) {
      errors.serverUrl = t('login.field.serverError');
      ok = false;
    }
  }
  if (p === 'local' || p === 'remote') {
    if (!form.tenantName.trim()) { errors.tenantName = t('login.field.libraryError'); ok = false; }
    if (!form.ownerName.trim()) { errors.ownerName = t('login.field.ownerError'); ok = false; }
  }
  if (p === 'remote') {
    if (form.adminPassword.length < 12) {
      errors.adminPassword = t('login.field.adminErrorRemote');
      ok = false;
    }
  }
  if (p === 'pair') {
    if (!form.inviteCode.trim()) { errors.inviteCode = t('login.field.inviteError'); ok = false; }
    if (form.adminPassword.length < 8) { errors.adminPassword = t('login.field.adminErrorPair'); ok = false; }
  }
  return ok;
}

// ---- Submit ---------------------------------------------------------------

async function finishAndEnter() {
  // Piccola conferma visiva prima del redirect: il bottone diventa check.
  success.value = true;
  const delay = reducedMotion() ? 0 : 450;
  setTimeout(() => {
    const redirect = (route.query.redirect as string | undefined) || '/';
    router.push(redirect);
  }, delay);
}

async function submit() {
  if (submitting.value || success.value) return;
  if (!validate()) return;
  submitting.value = true;
  submitError.value = null;
  try {
    if (path.value === 'local') {
      await auth.setupLocal({
        libraryName: form.tenantName.trim(),
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      await finishAndEnter();
    } else if (path.value === 'remote') {
      const res = await auth.setupTenant({
        serverUrl: form.serverUrl.trim(),
        bootstrapUrl: form.bootstrapUrl.trim() || undefined,
        tenantName: form.tenantName.trim(),
        adminPassword: form.adminPassword,
        ownerEmail: form.email.trim(),
        ownerName: form.ownerName.trim(),
        ownerPassword: form.password,
      });
      // One-click: pairing automatico. Se fallisce → percorso pair
      // precompilato + invite visibile.
      setupResult.value = { inviteCode: res.invite_code, tenantId: res.tenant_id };
      form.inviteCode = res.invite_code;
      try {
        await auth.bootstrap({
          serverUrl: form.serverUrl.trim(),
          bootstrapUrl: form.bootstrapUrl.trim() || undefined,
          inviteCode: res.invite_code,
          email: form.email.trim(),
          password: form.password,
          adminPassword: form.adminPassword,
          deviceName: form.deviceName.trim() || undefined,
        });
        await finishAndEnter();
      } catch {
        withMorph(() => { path.value = 'pair'; });
        submitError.value = t('login.error.pairAfterSetup');
      }
    } else if (path.value === 'pair') {
      await auth.bootstrap({
        serverUrl: form.serverUrl.trim(),
        bootstrapUrl: form.bootstrapUrl.trim() || undefined,
        inviteCode: form.inviteCode.trim(),
        email: form.email.trim(),
        password: form.password,
        adminPassword: form.adminPassword,
        deviceName: form.deviceName.trim() || undefined,
      });
      await finishAndEnter();
    } else {
      await auth.login({
        email: form.email.trim(),
        password: form.password,
        persist: form.remember,
      });
      await finishAndEnter();
    }
  } catch (e) {
    let msg: string;
    if (e instanceof Error) msg = e.message;
    else if (typeof e === 'string') msg = e;
    else {
      try { msg = JSON.stringify(e); } catch { msg = String(e); }
    }
    // Diagnostica: il bootstrap sta colpendo l'host mTLS-only.
    const looksLikeMtlsHost =
      /\bEOF\b/.test(msg) || /Unsolicited response/i.test(msg) || /\b400\b/.test(msg);
    if (
      (path.value === 'pair' || path.value === 'remote') &&
      !form.bootstrapUrl.trim() &&
      looksLikeMtlsHost
    ) {
      msg = t('login.error.mtlsHost');
      if (bootstrapDetails.value) {
        bootstrapDetails.value.open = true;
        requestAnimationFrame(() => {
          const el = document.getElementById('login-bootstrap') as HTMLInputElement | null;
          el?.focus();
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
    }
    submitError.value = msg || t('login.error.generic');
    console.error('[LoginView] submit failed:', e);
  } finally {
    submitting.value = false;
  }
}

const submitLabel = computed(() => {
  if (success.value) return t('login.submit.success');
  return t(`login.submit.${path.value}`);
});
const submitIcon = computed(() => {
  if (success.value) return 'pi pi-check';
  switch (path.value) {
    case 'local':  return 'pi pi-sparkles';
    case 'remote': return 'pi pi-server';
    case 'pair':   return 'pi pi-key';
    default:       return 'pi pi-sign-in';
  }
});

async function useAnotherAccount() {
  submitting.value = true;
  try {
    await auth.wipe();
    form.email = '';
    form.password = '';
    form.inviteCode = '';
    form.adminPassword = '';
    withMorph(() => {
      step.value = 'welcome';
      path.value = 'local';
    });
  } finally {
    submitting.value = false;
  }
}

// ---- Recovery codice invito -------------------------------------------

function toggleRecovery() {
  recoveryOpen.value = !recoveryOpen.value;
  recoveryError.value = null;
  recoverySuccess.value = null;
  if (recoveryOpen.value) {
    if (!recoveryForm.tenantName && form.tenantName) {
      recoveryForm.tenantName = form.tenantName;
    }
    requestAnimationFrame(() => {
      const el = document.getElementById('recovery-tenant') as HTMLInputElement | null;
      el?.focus();
    });
  }
}

async function submitRecovery() {
  recoveryError.value = null;
  recoverySuccess.value = null;
  const serverUrl = form.serverUrl.trim();
  const tenantName = recoveryForm.tenantName.trim();
  if (!URL_RE.test(serverUrl)) {
    recoveryError.value = t('login.recovery.errServer');
    return;
  }
  if (!tenantName) {
    recoveryError.value = t('login.recovery.errName');
    return;
  }
  if (recoveryForm.adminPassword.length < 12) {
    recoveryError.value = t('login.recovery.errPwd');
    return;
  }
  recoveryLoading.value = true;
  try {
    const res = await auth.recoverInvite({
      serverUrl,
      bootstrapUrl: form.bootstrapUrl.trim() || undefined,
      tenantName,
      adminPassword: recoveryForm.adminPassword,
    });
    form.inviteCode = res.invite_code;
    form.adminPassword = recoveryForm.adminPassword;
    recoverySuccess.value = t('login.recovery.success', { name: res.tenant_name });
    recoveryForm.adminPassword = '';
    setTimeout(() => {
      recoveryOpen.value = false;
      recoverySuccess.value = null;
    }, 2500);
  } catch (e) {
    let msg = '';
    if (e instanceof Error) msg = e.message;
    else if (typeof e === 'string') msg = e;
    else { try { msg = JSON.stringify(e); } catch { msg = String(e); } }
    if (/401|invalid credentials|unauthor/i.test(msg)) {
      recoveryError.value = t('login.recovery.errCredentials');
    } else {
      recoveryError.value = msg || t('login.recovery.errGeneric');
    }
  } finally {
    recoveryLoading.value = false;
  }
}

async function copyInvite() {
  if (!setupResult.value) return;
  try { await navigator.clipboard.writeText(setupResult.value.inviteCode); } catch { /* noop */ }
}
</script>

<template>
  <div class="login">
    <!-- Pannello brand (decorativo, nascosto su mobile) -->
    <aside class="login__brand" aria-hidden="true">
      <div class="login__brand-logo">
        <span class="login__brand-logo-mark"><i class="pi pi-book"></i></span>
        <span>Bookeeper</span>
      </div>
      <blockquote class="login__brand-quote">
        <p class="login__brand-quote-text">{{ t('login.brandQuote') }}</p>
        <p class="login__brand-quote-attr">{{ t('login.brandQuoteAttr') }}</p>
      </blockquote>
      <div class="login__brand-footer">
        <span>{{ t('login.brandFooterLeft') }}</span>
        <span>{{ t('login.brandFooterRight') }}</span>
      </div>
    </aside>

    <!-- Pannello form -->
    <section class="login__form-panel" aria-labelledby="login-title">
      <div class="login__form-actions-top">
        <Button
          text rounded severity="secondary"
          :icon="themeIcon"
          :aria-label="t('common.theme.toggleAria', { mode: ui.mode })"
          @click="ui.toggle()"
        />
      </div>

      <!-- ================= STEP 1: scelta percorso ================= -->
      <div v-if="step === 'welcome'" class="login__form" aria-labelledby="login-title">
        <h1 id="login-title" class="login__form-title">{{ t('login.welcomeTitle') }}</h1>
        <p class="login__form-subtitle">{{ t('login.welcomeSubtitle') }}</p>

        <div v-if="notice" class="login__alert" :class="`login__alert--${notice.kind}`"
             role="status" aria-live="polite">
          <i :class="notice.icon" aria-hidden="true"></i>
          <span>{{ t(notice.key) }}</span>
        </div>

        <div class="login__paths">
          <button
            v-for="(c, i) in pathCards"
            :key="c.id"
            type="button"
            class="login__path-card"
            :class="{ 'login__path-card--primary': i === 0 }"
            :style="{ 'view-transition-name': `path-${c.id}`, '--i': i }"
            @click="choosePath(c.id)"
          >
            <span class="login__path-icon"><i :class="c.icon" aria-hidden="true"></i></span>
            <span class="login__path-text">
              <span class="login__path-title">{{ c.title }}</span>
              <span class="login__path-desc">{{ c.desc }}</span>
            </span>
            <i class="pi pi-arrow-right login__path-arrow" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <!-- ================= STEP 2: form del percorso ================= -->
      <form v-else class="login__form" novalidate @submit.prevent="submit">
        <header class="login__step-head">
          <Button
            text rounded severity="secondary" icon="pi pi-arrow-left"
            :aria-label="t('login.backAria')"
            :disabled="submitting || success"
            @click="goWelcome"
          />
          <div
            v-if="activeCard"
            class="login__chip"
            :style="{ 'view-transition-name': `path-${activeCard.id}` }"
          >
            <span class="login__path-icon login__path-icon--sm">
              <i :class="activeCard.icon" aria-hidden="true"></i>
            </span>
            <h1 id="login-title" class="login__chip-title">{{ activeCard.title }}</h1>
          </div>
        </header>

        <p class="login__form-subtitle login__form-subtitle--tight">
          <template v-if="path === 'login'">
            {{ t('login.subtitle.login', { server: auth.serverURL || t('login.subtitle.loginFallbackServer') }) }}
          </template>
          <template v-else>
            {{ t(`login.subtitle.${path}`) }}
          </template>
        </p>

        <div v-if="notice" class="login__alert" :class="`login__alert--${notice.kind}`"
             role="status" aria-live="polite">
          <i :class="notice.icon" aria-hidden="true"></i>
          <span>{{ t(notice.key) }}</span>
        </div>

        <div v-if="setupResult" class="login__alert login__alert--success" role="status" aria-live="polite">
          <i class="pi pi-check-circle" aria-hidden="true"></i>
          <div class="login__alert-body">
            <strong>{{ t('login.created.title') }}</strong>
            <span>{{ t('login.created.invite') }} <code class="login__invite-code">{{ setupResult.inviteCode }}</code></span>
            <span class="login__alert-fine">{{ t('login.created.save') }}</span>
          </div>
          <Button text rounded severity="secondary" icon="pi pi-copy"
                  :aria-label="t('login.created.copyAria')" @click="copyInvite" />
        </div>

        <div v-if="submitError" class="login__alert" role="alert" aria-live="assertive">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          <span>{{ submitError }}</span>
        </div>

        <!-- ---- Server (remote + pair) ---- -->
        <template v-if="path === 'remote' || path === 'pair'">
          <div class="login__field">
            <label for="login-server" class="login__label">{{ t('login.field.server') }}</label>
            <InputText
              id="login-server" v-model="form.serverUrl"
              type="url" autocomplete="url" spellcheck="false"
              :invalid="!!errors.serverUrl"
              :aria-describedby="errors.serverUrl ? 'login-server-err' : 'login-server-hint'"
              :disabled="submitting || success"
            />
            <span v-if="!errors.serverUrl" id="login-server-hint" class="login__hint">
              {{ t('login.field.serverHint') }}
            </span>
            <span v-else id="login-server-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.serverUrl }}
            </span>
          </div>

          <details ref="bootstrapDetails" class="login__advanced">
            <summary>
              <i class="pi pi-cog" aria-hidden="true"></i>
              {{ t('login.field.advancedSummary') }}
            </summary>
            <div class="login__advanced-body">
              <label for="login-bootstrap" class="login__label">{{ t('login.field.advancedLabel') }}</label>
              <InputText
                id="login-bootstrap" v-model="form.bootstrapUrl"
                type="url" autocomplete="url" spellcheck="false"
                placeholder="https://bookeeper.tail22adce.ts.net"
                :disabled="submitting || success"
              />
              <span class="login__hint">{{ t('login.field.advancedHint') }}</span>
            </div>
          </details>
        </template>

        <!-- ---- Libreria + owner (local + remote) ---- -->
        <template v-if="path === 'local' || path === 'remote'">
          <div class="login__field">
            <label for="setup-tenant" class="login__label">{{ t('login.field.libraryName') }}</label>
            <InputText
              id="setup-tenant" v-model="form.tenantName"
              :placeholder="t('login.field.libraryPlaceholder')"
              :invalid="!!errors.tenantName"
              :aria-describedby="errors.tenantName ? 'setup-tenant-err' : 'setup-tenant-hint'"
              :disabled="submitting || success"
            />
            <span v-if="!errors.tenantName" id="setup-tenant-hint" class="login__hint">
              {{ t('login.field.libraryHint') }}
            </span>
            <span v-else id="setup-tenant-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.tenantName }}
            </span>
          </div>
          <div class="login__field">
            <label for="setup-owner-name" class="login__label">{{ t('login.field.ownerName') }}</label>
            <InputText
              id="setup-owner-name" v-model="form.ownerName"
              autocomplete="name" :placeholder="t('login.field.ownerPlaceholder')"
              :invalid="!!errors.ownerName"
              :aria-describedby="errors.ownerName ? 'setup-owner-name-err' : undefined"
              :disabled="submitting || success"
            />
            <span v-if="errors.ownerName" id="setup-owner-name-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.ownerName }}
            </span>
          </div>
        </template>

        <!-- ---- Codice invito + recovery (pair) ---- -->
        <template v-if="path === 'pair'">
          <div class="login__field">
            <label for="login-invite" class="login__label">{{ t('login.field.invite') }}</label>
            <InputText
              id="login-invite" v-model="form.inviteCode"
              autocomplete="off" spellcheck="false"
              :invalid="!!errors.inviteCode"
              :aria-describedby="errors.inviteCode ? 'login-invite-err' : 'login-invite-hint'"
              :disabled="submitting || success"
            />
            <span v-if="!errors.inviteCode" id="login-invite-hint" class="login__hint">
              {{ t('login.field.inviteHint') }}
            </span>
            <span v-else id="login-invite-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.inviteCode }}
            </span>
            <button type="button" class="login__link-button"
                    :disabled="submitting || success" @click="toggleRecovery">
              <i class="pi pi-shield" aria-hidden="true"></i>
              {{ recoveryOpen ? t('login.recovery.close') : t('login.recovery.open') }}
            </button>
          </div>

          <div v-if="recoveryOpen" class="login__recovery" role="region" :aria-label="t('login.recovery.open')">
            <p class="login__recovery-intro">
              <i class="pi pi-info-circle" aria-hidden="true"></i>
              <i18n-t keypath="login.recovery.intro" tag="span">
                <template #strong><strong>{{ t('login.recovery.introStrong') }}</strong></template>
              </i18n-t>
            </p>
            <div class="login__field">
              <label for="recovery-tenant" class="login__label">{{ t('login.recovery.libraryLabel') }}</label>
              <InputText
                id="recovery-tenant" v-model="recoveryForm.tenantName"
                :placeholder="t('login.field.libraryPlaceholder')" :disabled="recoveryLoading"
              />
            </div>
            <div class="login__field">
              <label for="recovery-admin" class="login__label">{{ t('login.recovery.adminLabel') }}</label>
              <Password
                input-id="recovery-admin" v-model="recoveryForm.adminPassword"
                :feedback="false" toggle-mask autocomplete="off"
                :disabled="recoveryLoading"
                :input-style="{ width: '100%' }"
                :pt="{ root: { style: 'width: 100%' } }"
              />
            </div>
            <div v-if="recoveryError" class="login__alert" role="alert" aria-live="assertive">
              <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
              <span>{{ recoveryError }}</span>
            </div>
            <div v-if="recoverySuccess" class="login__alert login__alert--success" role="status" aria-live="polite">
              <i class="pi pi-check-circle" aria-hidden="true"></i>
              <span>{{ recoverySuccess }}</span>
            </div>
            <Button type="button" :label="t('login.recovery.submit')"
                    icon="pi pi-refresh" severity="secondary"
                    :loading="recoveryLoading" @click="submitRecovery" />
          </div>
        </template>

        <!-- ---- Password amministratore (remote la sceglie, pair la chiede) ---- -->
        <template v-if="path === 'remote' || path === 'pair'">
          <div class="login__field">
            <label for="login-admin" class="login__label">
              {{ path === 'remote' ? t('login.field.adminChoose') : t('login.field.adminAsk') }}
            </label>
            <Password
              input-id="login-admin" v-model="form.adminPassword"
              :feedback="path === 'remote'" toggle-mask autocomplete="off"
              :invalid="!!errors.adminPassword"
              :aria-describedby="errors.adminPassword ? 'login-admin-err' : 'login-admin-hint'"
              :disabled="submitting || success"
              :input-style="{ width: '100%' }"
              :pt="{ root: { style: 'width: 100%' } }"
            />
            <span v-if="!errors.adminPassword" id="login-admin-hint" class="login__hint">
              <i18n-t v-if="path === 'remote'" keypath="login.field.adminHintRemote" tag="span">
                <template #strong><strong>{{ t('login.field.adminHintRemoteStrong') }}</strong></template>
              </i18n-t>
              <template v-else>{{ t('login.field.adminHintPair') }}</template>
            </span>
            <span v-else id="login-admin-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.adminPassword }}
            </span>
          </div>
        </template>

        <!-- ---- Email + password (tutti i percorsi) ---- -->
        <div class="login__field">
          <label for="login-email" class="login__label">{{ t('login.field.email') }}</label>
          <InputText
            id="login-email" v-model="form.email"
            type="email" autocomplete="username"
            :invalid="!!errors.email"
            :aria-describedby="errors.email ? 'login-email-err' : undefined"
            :disabled="submitting || success"
          />
          <span v-if="errors.email" id="login-email-err" class="login__error">
            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.email }}
          </span>
        </div>

        <div class="login__field">
          <label for="login-pwd" class="login__label">
            {{ path === 'login' || path === 'pair' ? t('login.field.password') : t('login.field.passwordChoose') }}
          </label>
          <Password
            input-id="login-pwd" v-model="form.password"
            :feedback="path === 'local' || path === 'remote'" toggle-mask
            :autocomplete="path === 'local' || path === 'remote' ? 'new-password' : 'current-password'"
            :invalid="!!errors.password"
            :aria-describedby="errors.password ? 'login-pwd-err' : undefined"
            :disabled="submitting || success"
            :input-style="{ width: '100%' }"
            :pt="{ root: { style: 'width: 100%' } }"
          />
          <span v-if="errors.password" id="login-pwd-err" class="login__error">
            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.password }}
          </span>
        </div>

        <div v-if="path === 'pair'" class="login__field">
          <label for="login-device" class="login__label">{{ t('login.field.deviceName') }} <span class="login__optional">{{ t('login.field.optional') }}</span></label>
          <InputText
            id="login-device" v-model="form.deviceName"
            autocomplete="off" :placeholder="t('login.field.devicePlaceholder')"
            :disabled="submitting || success"
          />
        </div>

        <div v-if="path === 'login'" class="login__row">
          <label class="login__remember">
            <Checkbox v-model="form.remember" :binary="true" input-id="login-remember" />
            <span>{{ t('login.field.remember') }}</span>
          </label>
        </div>

        <Button
          type="submit"
          :label="submitLabel"
          :icon="submitIcon"
          class="login__submit"
          :class="{ 'login__submit--success': success }"
          :loading="submitting"
          :disabled="success"
        />

        <div v-if="path === 'login'" class="login__alt">
          <button type="button" class="login__link-button"
                  :disabled="submitting || success" @click="useAnotherAccount">
            <i class="pi pi-refresh" aria-hidden="true"></i>
            {{ t('login.anotherAccount') }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
