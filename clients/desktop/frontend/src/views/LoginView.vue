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
// La logica di autenticazione è identica a prima (store auth): setupLocal,
// setupTenant→bootstrap concatenati, bootstrap, login, recoverInvite.

import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
      title: 'Bentornato',
      desc: `Rientra${auth.session.email ? ` come ${auth.session.email}` : ''} con la tua password.`,
    });
  }
  cards.push(
    {
      id: 'local',
      icon: 'pi pi-desktop',
      title: 'Crea la tua libreria qui',
      desc: 'Tutto su questo computer: nessun server, un solo passaggio.',
    },
    {
      id: 'remote',
      icon: 'pi pi-server',
      title: 'Crea su un server',
      desc: 'Hai un Bookeeper self-hosted (NAS, Raspberry, VPS) ancora vuoto.',
    },
    {
      id: 'pair',
      icon: 'pi pi-key',
      title: 'Unisciti a una libreria',
      desc: 'La libreria esiste già: associa questo computer col codice invito.',
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
interface LoginNotice { kind: 'info' | 'warn'; icon: string; text: string }
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
  notice.value = {
    kind: 'warn',
    icon: 'pi pi-clock',
    text: 'La tua sessione è scaduta. Reinserisci la password per continuare.',
  };
} else if (route.query.loggedout === '1') {
  notice.value = {
    kind: 'info',
    icon: 'pi pi-sign-out',
    text: 'Disconnesso. Inserisci la password per rientrare.',
  };
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

  if (!EMAIL_RE.test(form.email)) { errors.email = 'Email non valida'; ok = false; }
  if (form.password.length < 8) { errors.password = 'Almeno 8 caratteri'; ok = false; }

  if (p === 'remote' || p === 'pair') {
    if (!URL_RE.test(form.serverUrl.trim())) {
      errors.serverUrl = 'Inserisci un URL valido (https://…)';
      ok = false;
    }
  }
  if (p === 'local' || p === 'remote') {
    if (!form.tenantName.trim()) { errors.tenantName = 'Dai un nome alla libreria'; ok = false; }
    if (!form.ownerName.trim()) { errors.ownerName = 'Come ti chiami?'; ok = false; }
  }
  if (p === 'remote') {
    if (form.adminPassword.length < 12) {
      errors.adminPassword = 'Minimo 12 caratteri: protegge la chiave della libreria';
      ok = false;
    }
  }
  if (p === 'pair') {
    if (!form.inviteCode.trim()) { errors.inviteCode = 'Serve il codice invito della libreria'; ok = false; }
    if (form.adminPassword.length < 8) { errors.adminPassword = 'Almeno 8 caratteri'; ok = false; }
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
        submitError.value =
          'Libreria creata, ma l\'associazione automatica è fallita. Riprova da qui: i campi sono già compilati.';
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
      msg =
        'Il server non risponde su questo indirizzo (il dominio pubblico è mTLS-only). ' +
        'Apri "Il server è su rete privata?" e inserisci l\'host che espone il pairing ' +
        '(es. https://bookeeper.tail22adce.ts.net).';
      if (bootstrapDetails.value) {
        bootstrapDetails.value.open = true;
        requestAnimationFrame(() => {
          const el = document.getElementById('login-bootstrap') as HTMLInputElement | null;
          el?.focus();
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
    }
    submitError.value = msg || 'Errore di autenticazione';
    console.error('[LoginView] submit failed:', e);
  } finally {
    submitting.value = false;
  }
}

const submitLabel = computed(() => {
  if (success.value) return 'Benvenuto!';
  switch (path.value) {
    case 'local':  return 'Crea la libreria';
    case 'remote': return 'Crea e associa';
    case 'pair':   return 'Associa e accedi';
    default:       return 'Accedi';
  }
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
    recoveryError.value = 'Compila prima l\'indirizzo del server qui sopra.';
    return;
  }
  if (!tenantName) {
    recoveryError.value = 'Indica il nome della libreria.';
    return;
  }
  if (recoveryForm.adminPassword.length < 12) {
    recoveryError.value = 'La password amministratore ha almeno 12 caratteri.';
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
    recoverySuccess.value =
      `Nuovo codice generato per “${res.tenant_name}”. Quello vecchio non funziona più.`;
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
      recoveryError.value = 'Nome libreria o password amministratore non corretti.';
    } else {
      recoveryError.value = msg || 'Recupero fallito.';
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
        <p class="login__brand-quote-text">
          "Sapeva leggere. Fu la scoperta più importante di tutta la sua vita. Sapeva leggere. Possedeva l’antidoto contro il terribile veleno della vecchiaia."
        </p>
        <p class="login__brand-quote-attr">— Luis Sepúlveda</p>
      </blockquote>
      <div class="login__brand-footer">
        <span>self-hosted</span>
        <span>la tua libreria, a casa tua</span>
      </div>
    </aside>

    <!-- Pannello form -->
    <section class="login__form-panel" aria-labelledby="login-title">
      <div class="login__form-actions-top">
        <Button
          text rounded severity="secondary"
          :icon="themeIcon"
          :aria-label="`Cambia tema (corrente: ${ui.mode})`"
          @click="ui.toggle()"
        />
      </div>

      <!-- ================= STEP 1: scelta percorso ================= -->
      <div v-if="step === 'welcome'" class="login__form" aria-labelledby="login-title">
        <h1 id="login-title" class="login__form-title">Benvenuto in Bookeeper</h1>
        <p class="login__form-subtitle">La tua libreria di casa. Da dove vuoi iniziare?</p>

        <div v-if="notice" class="login__alert" :class="`login__alert--${notice.kind}`"
             role="status" aria-live="polite">
          <i :class="notice.icon" aria-hidden="true"></i>
          <span>{{ notice.text }}</span>
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
            aria-label="Torna alla scelta"
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
          <template v-if="path === 'local'">
            Nessun server, nessuna configurazione: i dati restano su questo PC.
          </template>
          <template v-else-if="path === 'remote'">
            Creo la libreria sul tuo server e associo subito questo computer.
          </template>
          <template v-else-if="path === 'pair'">
            Ti servono il codice invito e la password amministratore della libreria.
          </template>
          <template v-else>
            Accedi al server {{ auth.serverURL || 'configurato' }}.
          </template>
        </p>

        <div v-if="notice" class="login__alert" :class="`login__alert--${notice.kind}`"
             role="status" aria-live="polite">
          <i :class="notice.icon" aria-hidden="true"></i>
          <span>{{ notice.text }}</span>
        </div>

        <div v-if="setupResult" class="login__alert login__alert--success" role="status" aria-live="polite">
          <i class="pi pi-check-circle" aria-hidden="true"></i>
          <div class="login__alert-body">
            <strong>Libreria creata.</strong>
            <span>Codice invito: <code class="login__invite-code">{{ setupResult.inviteCode }}</code></span>
            <span class="login__alert-fine">Salvalo: serve per associare altri dispositivi.</span>
          </div>
          <Button text rounded severity="secondary" icon="pi pi-copy"
                  aria-label="Copia invite code" @click="copyInvite" />
        </div>

        <div v-if="submitError" class="login__alert" role="alert" aria-live="assertive">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          <span>{{ submitError }}</span>
        </div>

        <!-- ---- Server (remote + pair) ---- -->
        <template v-if="path === 'remote' || path === 'pair'">
          <div class="login__field">
            <label for="login-server" class="login__label">Indirizzo del server</label>
            <InputText
              id="login-server" v-model="form.serverUrl"
              type="url" autocomplete="url" spellcheck="false"
              :invalid="!!errors.serverUrl"
              :aria-describedby="errors.serverUrl ? 'login-server-err' : 'login-server-hint'"
              :disabled="submitting || success"
            />
            <span v-if="!errors.serverUrl" id="login-server-hint" class="login__hint">
              Es. https://bookeeper.tuodominio.it
            </span>
            <span v-else id="login-server-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.serverUrl }}
            </span>
          </div>

          <details ref="bootstrapDetails" class="login__advanced">
            <summary>
              <i class="pi pi-cog" aria-hidden="true"></i>
              Il server è su rete privata (Tailscale, VPN)?
            </summary>
            <div class="login__advanced-body">
              <label for="login-bootstrap" class="login__label">Indirizzo alternativo per il pairing</label>
              <InputText
                id="login-bootstrap" v-model="form.bootstrapUrl"
                type="url" autocomplete="url" spellcheck="false"
                placeholder="https://bookeeper.tail22adce.ts.net"
                :disabled="submitting || success"
              />
              <span class="login__hint">
                Lascia vuoto nella maggior parte dei casi. Se sbagli, te lo segnalo al primo tentativo.
              </span>
            </div>
          </details>
        </template>

        <!-- ---- Libreria + owner (local + remote) ---- -->
        <template v-if="path === 'local' || path === 'remote'">
          <div class="login__field">
            <label for="setup-tenant" class="login__label">Nome della libreria</label>
            <InputText
              id="setup-tenant" v-model="form.tenantName"
              placeholder="Es. Casa Cremisi"
              :invalid="!!errors.tenantName"
              :aria-describedby="errors.tenantName ? 'setup-tenant-err' : 'setup-tenant-hint'"
              :disabled="submitting || success"
            />
            <span v-if="!errors.tenantName" id="setup-tenant-hint" class="login__hint">
              Solo un'etichetta: puoi cambiarla quando vuoi.
            </span>
            <span v-else id="setup-tenant-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.tenantName }}
            </span>
          </div>
          <div class="login__field">
            <label for="setup-owner-name" class="login__label">Il tuo nome</label>
            <InputText
              id="setup-owner-name" v-model="form.ownerName"
              autocomplete="name" placeholder="Es. Lorenzo"
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
            <label for="login-invite" class="login__label">Codice invito</label>
            <InputText
              id="login-invite" v-model="form.inviteCode"
              autocomplete="off" spellcheck="false"
              :invalid="!!errors.inviteCode"
              :aria-describedby="errors.inviteCode ? 'login-invite-err' : 'login-invite-hint'"
              :disabled="submitting || success"
            />
            <span v-if="!errors.inviteCode" id="login-invite-hint" class="login__hint">
              Lo trovi in Impostazioni → Libreria su un dispositivo già associato.
            </span>
            <span v-else id="login-invite-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.inviteCode }}
            </span>
            <button type="button" class="login__link-button"
                    :disabled="submitting || success" @click="toggleRecovery">
              <i class="pi pi-shield" aria-hidden="true"></i>
              {{ recoveryOpen ? 'Annulla recupero' : 'Hai perso il codice invito?' }}
            </button>
          </div>

          <div v-if="recoveryOpen" class="login__recovery" role="region" aria-label="Recupero codice invito">
            <p class="login__recovery-intro">
              <i class="pi pi-info-circle" aria-hidden="true"></i>
              Se conosci la <strong>password amministratore</strong> ne genero uno nuovo
              (il vecchio smette di funzionare).
            </p>
            <div class="login__field">
              <label for="recovery-tenant" class="login__label">Nome della libreria</label>
              <InputText
                id="recovery-tenant" v-model="recoveryForm.tenantName"
                placeholder="Es. Casa Cremisi" :disabled="recoveryLoading"
              />
            </div>
            <div class="login__field">
              <label for="recovery-admin" class="login__label">Password amministratore</label>
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
            <Button type="button" label="Recupera codice"
                    icon="pi pi-refresh" severity="secondary"
                    :loading="recoveryLoading" @click="submitRecovery" />
          </div>

        </template>

        <!-- ---- Password amministratore (remote la sceglie, pair la chiede) ---- -->
        <template v-if="path === 'remote' || path === 'pair'">
          <div class="login__field">
            <label for="login-admin" class="login__label">
              {{ path === 'remote' ? 'Scegli la password amministratore' : 'Password amministratore' }}
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
              <template v-if="path === 'remote'">
                Minimo 12 caratteri. Protegge la chiave della libreria: <strong>non è recuperabile</strong>, salvala in un password manager.
              </template>
              <template v-else>
                Quella scelta da chi ha creato la libreria.
              </template>
            </span>
            <span v-else id="login-admin-err" class="login__error">
              <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.adminPassword }}
            </span>
          </div>
        </template>

        <!-- ---- Email + password (tutti i percorsi) ---- -->
        <div class="login__field">
          <label for="login-email" class="login__label">Email</label>
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
            {{ path === 'login' || path === 'pair' ? 'Password' : 'Scegli la tua password' }}
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
          <label for="login-device" class="login__label">Nome di questo dispositivo <span class="login__optional">(facoltativo)</span></label>
          <InputText
            id="login-device" v-model="form.deviceName"
            autocomplete="off" placeholder="Es. PC studio"
            :disabled="submitting || success"
          />
        </div>

        <div v-if="path === 'login'" class="login__row">
          <label class="login__remember">
            <Checkbox v-model="form.remember" :binary="true" input-id="login-remember" />
            <span>Ricordami su questo dispositivo</span>
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
            Usa un altro account o un'altra libreria
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
