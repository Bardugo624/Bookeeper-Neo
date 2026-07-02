<script setup lang="ts">
// LoginView — entry point dell'autenticazione. Tre modalità mutuamente
// esclusive, scelte dall'utente o dedotte dallo stato del keystore.
//
//   1. SETUP — primissimo avvio del server: nessun tenant esiste ancora.
//      Compila tenant_name + admin_password + dati owner. Backend chiamato
//      via /setup/tenant (porta non-mTLS) → restituisce invite_code.
//      Al successo il form passa automaticamente in modalità PAIR
//      pre-popolata.
//
//   2. PAIR  — il tenant esiste ma questo dispositivo non è ancora
//      paired (o è stato wipe-ato). Genera CSR lato Go e ottiene un
//      cert client dal CA del tenant. Richiede invite_code +
//      admin_password.
//
//   3. LOGIN — c'è già un cert paired: solo email + password.
//
// L'utente può forzare la modalità SETUP/PAIR cliccando i bottoni in
// fondo al form.

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Checkbox from 'primevue/checkbox';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import './LoginView.css';

type Mode = 'login' | 'pair' | 'setup';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const ui = useUiStore();

const mode = ref<Mode>('login');

// Dove vive la libreria in modalità SETUP: 'local' = server embedded su
// questo PC (one-click, zero configurazione), 'remote' = server esterno.
type SetupTarget = 'local' | 'remote';
const setupTarget = ref<SetupTarget>('local');

interface FormState {
    serverUrl: string;
    bootstrapUrl: string;
    // Setup-only
    tenantName: string;
    ownerName: string;
    // Pair-only
    inviteCode: string;
    adminPassword: string;
    deviceName: string;
    // Common (login + pair) — owner per setup
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
// Notice (info/warn) separato dall'errore di submit: usato per
// comunicare "sessione scaduta" o "disconnesso" al rientro nella
// LoginView. Visivamente è ambra (non rosso) per non sembrare un
// fallimento del form.
interface LoginNotice { kind: 'info' | 'warn'; icon: string; text: string }
const notice = ref<LoginNotice | null>(null);
const submitting = ref(false);

// Banner mostrato dopo un setup riuscito: invita l'utente a salvare
// l'invite code (sarà nella tabella tenants ma è comodo averlo qui).
const setupResult = ref<{ inviteCode: string; tenantId: string } | null>(null);

// --- Recovery codice invito --------------------------------------------
//
// Pannello inline (modalita' PAIR) per chi ha perso l'invite code ma
// conosce ancora l'admin password. Va sulla porta bootstrap (no mTLS),
// quindi serve solo Server URL gia' compilato + nome tenant + password.
// Su success rigenera l'invite e lo inietta nel form.
const recoveryOpen = ref(false);
const recoveryForm = reactive({ tenantName: '', adminPassword: '' });
const recoveryError = ref<string | null>(null);
const recoverySuccess = ref<string | null>(null);
const recoveryLoading = ref(false);

// Ref al <details> del Bootstrap URL: lo apriamo programmaticamente
// quando l'errore di submit indica un host mTLS-only e il bootstrap
// non e' compilato. In tutti gli altri casi resta chiuso (UX pulita
// per chi non usa Tailscale/VPN).
const bootstrapDetails = ref<HTMLDetailsElement | null>(null);

const themeIcon = computed(() => {
    if (ui.mode === 'system') return 'pi pi-desktop';
    return ui.isDark ? 'pi pi-sun' : 'pi pi-moon';
});

const titleText = computed(() => {
    switch (mode.value) {
        case 'setup': return 'Crea la tua libreria';
        case 'pair':  return 'Associa questo dispositivo';
        default:      return 'Bentornato';
    }
});
const subtitleText = computed(() => {
    switch (mode.value) {
        case 'setup':
            return setupTarget.value === 'local'
                ? 'Tutto su questo computer: nessun server da configurare. Un click e sei dentro.'
                : 'Crea la libreria su un server remoto. Questo dispositivo verrà associato in automatico.';
        case 'pair':
            return 'Genera un certificato client per il primo accesso al tuo server Bookeeper.';
        default:
            return `Accedi al server ${auth.serverURL || 'configurato'}.`;
    }
});
const submitLabel = computed(() => {
    switch (mode.value) {
        case 'setup': return setupTarget.value === 'local' ? 'Crea la libreria' : 'Crea e associa';
        case 'pair':  return 'Associa e accedi';
        default:      return 'Accedi';
    }
});
const submitIcon = computed(() => {
    switch (mode.value) {
        case 'setup': return 'pi pi-cog';
        case 'pair':  return 'pi pi-key';
        default:      return 'pi pi-sign-in';
    }
});

// Guard difensivo: la modalita' LOGIN richiede un cert paired (altrimenti
// il submit fallisce con "no session: bootstrap required" lato Go). Se
// per qualunque motivo finiamo in LOGIN senza cert (es. l'utente naviga
// indietro dopo un wipe, o il guard di rotta ci porta qui da una
// protected route post-logout), forziamo lo switch a PAIR. Il watch e'
// piu' robusto del solo onMounted perche' interviene anche dopo
// state-change in-place.
watch(
    () => [mode.value, auth.session.has_cert] as const,
    ([m, hasCert]) => {
        if (m === 'login' && !hasCert) {
            mode.value = 'pair';
        }
    },
);

onMounted(() => {
    // Decidi la modalità iniziale in base allo stato della sessione:
    //   - Nessun cert paired → SETUP con target "questo computer": è il
    //     percorso plug-n-play del primo avvio. Chi ha già un server usa
    //     "Ho già un tenant (associa)".
    //   - Cert presente (con o senza tokens validi) → LOGIN (l'utente
    //     deve solo riautenticarsi, niente nuovo pairing).
    if (!auth.session.has_cert) {
        mode.value = 'setup';
    } else {
        mode.value = 'login';
    }
    if (auth.session.email) form.email = auth.session.email;
    if (auth.serverURL) form.serverUrl = auth.serverURL;

    // Banner per chi arriva qui dopo che il refresh JWT ha fallito
    // (token scaduto, refresh revocato, ecc).
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
});

function clearErrors() {
    for (const k of Object.keys(errors) as (keyof FormState)[]) errors[k] = '';
    submitError.value = null;
}

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validate(): boolean {
    clearErrors();
    let ok = true;

    if (mode.value !== 'setup') {
        // login + pair: email + password sono dell'utente che accede
        if (!EMAIL_RE.test(form.email)) { errors.email = 'Email non valida'; ok = false; }
        if (form.password.length < 8) { errors.password = 'Almeno 8 caratteri'; ok = false; }
    }

    const remoteSetup = mode.value === 'setup' && setupTarget.value === 'remote';
    if (mode.value === 'pair' || remoteSetup) {
        if (!URL_RE.test(form.serverUrl.trim())) {
            errors.serverUrl = 'Inserisci un URL valido (https://...)';
            ok = false;
        }
    }

    if (mode.value === 'pair') {
        if (!form.inviteCode.trim()) { errors.inviteCode = 'Codice invito obbligatorio'; ok = false; }
        if (form.adminPassword.length < 8) { errors.adminPassword = 'Almeno 8 caratteri'; ok = false; }
    }

    if (mode.value === 'setup') {
        if (!form.tenantName.trim()) { errors.tenantName = 'Nome libreria obbligatorio'; ok = false; }
        // In locale la admin password viene generata e custodita dall'app.
        if (remoteSetup && form.adminPassword.length < 12) {
            errors.adminPassword = 'Min 12 caratteri (cifra il CA del tenant)';
            ok = false;
        }
        if (!form.ownerName.trim()) { errors.ownerName = 'Nome utente obbligatorio'; ok = false; }
        if (!EMAIL_RE.test(form.email)) { errors.email = 'Email owner non valida'; ok = false; }
        if (form.password.length < 8) { errors.password = 'Almeno 8 caratteri'; ok = false; }
    }

    return ok;
}

async function submit() {
    if (!validate()) return;
    submitting.value = true;
    submitError.value = null;
    try {
        if (mode.value === 'setup' && setupTarget.value === 'local') {
            // One-click: server embedded + tenant + pairing, tutto lato Go.
            await auth.setupLocal({
                libraryName: form.tenantName.trim(),
                ownerName: form.ownerName.trim(),
                email: form.email.trim(),
                password: form.password,
            });
            router.push('/');
        } else if (mode.value === 'setup') {
            const res = await auth.setupTenant({
                serverUrl: form.serverUrl.trim(),
                bootstrapUrl: form.bootstrapUrl.trim() || undefined,
                tenantName: form.tenantName.trim(),
                adminPassword: form.adminPassword,
                ownerEmail: form.email.trim(),
                ownerName: form.ownerName.trim(),
                ownerPassword: form.password,
            });
            // One-click: setup riuscito → pairing automatico con le stesse
            // credenziali. L'invite code resta consultabile in Impostazioni
            // → Tenant; se il pairing fallisce, ricadiamo sul form PAIR
            // pre-popolato come prima.
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
                router.push('/');
            } catch {
                mode.value = 'pair';
                submitError.value =
                    'Tenant creato, ma il pairing automatico è fallito. Riprova da qui: i campi sono già compilati.';
            }
        } else if (mode.value === 'pair') {
            await auth.bootstrap({
                serverUrl: form.serverUrl.trim(),
                bootstrapUrl: form.bootstrapUrl.trim() || undefined,
                inviteCode: form.inviteCode.trim(),
                email: form.email.trim(),
                password: form.password,
                adminPassword: form.adminPassword,
                deviceName: form.deviceName.trim() || undefined,
            });
            const redirect = (route.query.redirect as string | undefined) || '/';
            router.push(redirect);
        } else {
            await auth.login({
                email: form.email.trim(),
                password: form.password,
                persist: form.remember,
            });
            const redirect = (route.query.redirect as string | undefined) || '/';
            router.push(redirect);
        }
    } catch (e) {
        // Wails a volte rilancia stringhe nude (non Error). Stampa
        // sempre qualcosa di utile invece del generico fallback.
        let msg: string;
        if (e instanceof Error) msg = e.message;
        else if (typeof e === 'string') msg = e;
        else {
            try { msg = JSON.stringify(e); } catch { msg = String(e); }
        }
        // Diagnostica specifica: il bootstrap sta colpendo l'host mTLS.
        const looksLikeMtlsHost =
            /\bEOF\b/.test(msg) ||
            /Unsolicited response/i.test(msg) ||
            /\b400\b/.test(msg);
        if (
            (mode.value === 'pair' || mode.value === 'setup') &&
            !form.bootstrapUrl.trim() &&
            looksLikeMtlsHost
        ) {
            msg =
                'Il pairing non è raggiungibile sul Server URL: il dominio pubblico è mTLS-only. ' +
                'Compila "URL bootstrap" con l\'host che espone /setup e /pairing ' +
                '(es. tailnet https://bookeeper.tail22adce.ts.net).';
            // Apri programmaticamente il <details> del bootstrap URL e
            // sposta il focus sul campo: l'utente trova il campo gia'
            // pronto invece di dover capire dove cliccare.
            if (bootstrapDetails.value) {
                bootstrapDetails.value.open = true;
                // Aspetta il tick successivo perche' l'input potrebbe
                // essere stato appena montato dal v-show del details.
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

async function useAnotherAccount() {
    submitting.value = true;
    try {
        await auth.wipe();
        mode.value = 'pair';
        form.email = '';
        form.password = '';
        form.inviteCode = '';
        form.adminPassword = '';
    } finally {
        submitting.value = false;
    }
}

function gotoSetup() {
    setupResult.value = null;
    clearErrors();
    mode.value = 'setup';
}

// Torna alla schermata di login standard. Usato come "back" sia da
// PAIR che da SETUP. Se non c'e' un cert paired (caso post-wipe o
// primissimo avvio) torniamo comunque a LOGIN: il submit fallira'
// con un errore chiaro che invita l'utente a riassociarsi, ma e'
// preferibile a non avere alcuna via di uscita dal form.
function backToLogin() {
    setupResult.value = null;
    clearErrors();
    mode.value = 'login';
}

// --- Recovery codice invito ---------------------------------------------

function toggleRecovery() {
    recoveryOpen.value = !recoveryOpen.value;
    recoveryError.value = null;
    recoverySuccess.value = null;
    if (recoveryOpen.value) {
        // Pre-compila il nome tenant se l'abbiamo gia' (caso "vengo da
        // setup appena fatto"): risparmia un campo.
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
        recoveryError.value = 'Compila prima il Server URL qui sopra.';
        return;
    }
    if (!tenantName) {
        recoveryError.value = 'Indica il nome del tenant.';
        return;
    }
    if (recoveryForm.adminPassword.length < 12) {
        recoveryError.value = 'La password admin ha almeno 12 caratteri.';
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
        // Inietta il nuovo invite code nel form di pairing.
        form.inviteCode = res.invite_code;
        // Buona fede: l'utente conosce la admin password, e' verosimile
        // che sia lui l'admin del tenant. Pre-compiliamo anche la admin
        // password del form principale, cosi' il pairing parte subito.
        form.adminPassword = recoveryForm.adminPassword;
        recoverySuccess.value =
            `Nuovo codice generato per “${res.tenant_name}”. Quello vecchio non funziona piu'.`;
        // Pulisci la password admin del pannello recovery (resta nel
        // form principale, dove serve adesso). Chiudi il pannello.
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
        // Il server torna 401 "invalid credentials" sia per tenant
        // inesistente sia per password sbagliata: messaggio uniforme.
        if (/401|invalid credentials|unauthor/i.test(msg)) {
            recoveryError.value = 'Nome tenant o password admin non corretti.';
        } else {
            recoveryError.value = msg || 'Recupero fallito.';
        }
    } finally {
        recoveryLoading.value = false;
    }
}

function pairMobile() {
    submitError.value = 'Pairing mobile non ancora implementato.';
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
                <span>v0.1 • mTLS bootstrap</span>
                <span>self-hosted</span>
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

            <form class="login__form" @submit.prevent="submit" novalidate>
                <h1 id="login-title" class="login__form-title">{{ titleText }}</h1>
                <p class="login__form-subtitle">{{ subtitleText }}</p>

                <div v-if="setupResult" class="login__alert" role="status" aria-live="polite"
                     style="background: var(--p-green-50, #ecfdf5); color: var(--p-green-900, #064e3b); border-color: var(--p-green-300, #6ee7b7);">
                    <i class="pi pi-check-circle" aria-hidden="true"></i>
                    <div style="display:flex;flex-direction:column;gap:0.25rem;flex:1;min-width:0;">
                        <strong>Tenant creato.</strong>
                        <span style="font-size:0.8125rem;">
                            Invite code:
                            <code style="user-select:all;font-family:monospace;">{{ setupResult.inviteCode }}</code>
                        </span>
                        <span style="font-size:0.75rem;opacity:0.8;">
                            Salvalo: serve per associare altri dispositivi (PC, mobile).
                        </span>
                    </div>
                    <Button text rounded severity="secondary" icon="pi pi-copy"
                            aria-label="Copia invite code" @click="copyInvite" />
                </div>

                <div v-if="notice" class="login__alert" :class="`login__alert--${notice.kind}`"
                     role="status" aria-live="polite">
                    <i :class="notice.icon" aria-hidden="true"></i>
                    <span>{{ notice.text }}</span>
                </div>

                <div v-if="submitError" class="login__alert" role="alert" aria-live="assertive">
                    <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                    <span>{{ submitError }}</span>
                </div>

                <!-- Guida contestuale per la creazione di un nuovo tenant.
                     Visibile solo in SETUP: spiega cosa stiamo per fare,
                     l'ordine dei passi e la differenza tra le due password
                     (CA del tenant vs utente owner). -->
                <!-- Scelta della destinazione: questo PC (embedded) o server remoto. -->
                <div v-if="mode === 'setup'" class="login__field" role="radiogroup" aria-label="Dove creare la libreria">
                    <label class="login__label">Dove vuoi la tua libreria?</label>
                    <div style="display:flex;gap:0.5rem;">
                        <Button
                            type="button" icon="pi pi-desktop" label="Questo computer"
                            style="flex:1;" :outlined="setupTarget !== 'local'"
                            severity="secondary" :disabled="submitting"
                            role="radio" :aria-checked="setupTarget === 'local'"
                            @click="setupTarget = 'local'" />
                        <Button
                            type="button" icon="pi pi-server" label="Server remoto"
                            style="flex:1;" :outlined="setupTarget !== 'remote'"
                            severity="secondary" :disabled="submitting"
                            role="radio" :aria-checked="setupTarget === 'remote'"
                            @click="setupTarget = 'remote'" />
                    </div>
                    <span class="login__hint">
                        {{ setupTarget === 'local'
                            ? 'I dati restano su questo PC. Niente da installare o configurare.'
                            : 'Serve un server Bookeeper già raggiungibile (NAS, VPS, Raspberry).' }}
                    </span>
                </div>

                <aside v-if="mode === 'setup' && setupTarget === 'remote'" class="login__guide" aria-label="Guida alla creazione del tenant">
                    <header class="login__guide-header">
                        <i class="pi pi-info-circle" aria-hidden="true"></i>
                        <strong>Stai creando un nuovo tenant</strong>
                    </header>
                    <p class="login__guide-text">
                        Un <em>tenant</em> è la tua libreria isolata sul server: contiene i libri,
                        gli utenti e i dispositivi associati. Crealo solo al <strong>primo avvio</strong>
                        del server: ne basta uno per famiglia / installazione.
                    </p>
                    <ol class="login__guide-steps">
                        <li>
                            <strong>Indica il server</strong>
                            <span>L'URL pubblico (mTLS) del tuo Bookeeper. Se il pairing è esposto solo su rete privata, apri "Endpoint pairing alternativo".</span>
                        </li>
                        <li>
                            <strong>Dai un nome al tenant</strong>
                            <span>Es. "Casa Cremisi" — è solo un'etichetta umana, puoi cambiarla dopo.</span>
                        </li>
                        <li>
                            <strong>Imposta la password amministratore</strong>
                            <span>Cifra la chiave privata del tenant (CA). <strong>Non è recuperabile</strong>: salvala in un password manager.</span>
                        </li>
                        <li>
                            <strong>Crea l'utente owner</strong>
                            <span>Sei tu: nome, email e password con cui farai login da questo PC e dagli altri dispositivi.</span>
                        </li>
                        <li>
                            <strong>Riceverai un codice invito</strong>
                            <span>Servirà per associare PC e mobile aggiuntivi a questo tenant. Questo dispositivo verrà associato in automatico.</span>
                        </li>
                    </ol>
                    <p class="login__guide-warn">
                        <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
                        Se hai già creato un tenant in passato, usa <strong>"Ho già un tenant (associa)"</strong> qui sotto: due tenant sullo stesso server sono indipendenti e non condividono libri.
                    </p>
                </aside>

                <!-- URL server: PAIR sempre, SETUP solo se remoto -->
                <template v-if="mode === 'pair' || (mode === 'setup' && setupTarget === 'remote')">
                    <div class="login__field">
                        <label for="login-server" class="login__label">Server URL</label>
                        <InputText
                            id="login-server" v-model="form.serverUrl"
                            type="url" autocomplete="url" spellcheck="false"
                            :invalid="!!errors.serverUrl"
                            :aria-describedby="errors.serverUrl ? 'login-server-err' : 'login-server-hint'"
                            :disabled="submitting"
                        />
                        <span v-if="!errors.serverUrl" id="login-server-hint" class="login__hint">
                            Es. https://bookeeper.tuodominio.it (URL mTLS, persistente).
                        </span>
                        <span v-else id="login-server-err" class="login__error">
                            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.serverUrl }}
                        </span>
                    </div>

                    <details ref="bootstrapDetails" class="login__field"
                             style="border:1px solid var(--p-content-border-color);border-radius:0.5rem;padding:0.5rem 0.75rem;">
                        <summary style="cursor:pointer;font-size:0.8125rem;color:var(--p-text-muted-color);">
                            <i class="pi pi-cog" aria-hidden="true" style="font-size:0.75rem;margin-right:0.25rem;"></i>
                            Opzioni avanzate (server su rete privata)
                        </summary>
                        <div style="display:flex;flex-direction:column;gap:0.375rem;margin-top:0.5rem;">
                            <label for="login-bootstrap" class="login__label">URL pairing alternativo</label>
                            <InputText
                                id="login-bootstrap" v-model="form.bootstrapUrl"
                                type="url" autocomplete="url" spellcheck="false"
                                placeholder="https://bookeeper.tail22adce.ts.net"
                                :disabled="submitting"
                            />
                            <span class="login__hint">
                                Lascia vuoto nella maggior parte dei casi. Compila solo se il pairing
                                e' raggiungibile su un host diverso (es. <strong>Tailscale</strong>, VPN o LAN)
                                rispetto al Server URL pubblico mTLS. Se sbagli, te lo segnalo io al primo tentativo.
                            </span>
                        </div>
                    </details>
                </template>

                <!-- Campi solo SETUP -->
                <template v-if="mode === 'setup'">
                    <div class="login__field">
                        <label for="setup-tenant" class="login__label">Nome libreria</label>
                        <InputText
                            id="setup-tenant" v-model="form.tenantName"
                            placeholder="Es. Casa Cremisi"
                            :invalid="!!errors.tenantName"
                            :aria-describedby="errors.tenantName ? 'setup-tenant-err' : 'setup-tenant-hint'"
                            :disabled="submitting"
                        />
                        <span v-if="!errors.tenantName" id="setup-tenant-hint" class="login__hint">
                            Etichetta della tua libreria. Solo per riconoscerla, puoi cambiarla dopo.
                        </span>
                        <span v-if="errors.tenantName" id="setup-tenant-err" class="login__error">
                            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.tenantName }}
                        </span>
                    </div>
                    <div class="login__field">
                        <label for="setup-owner-name" class="login__label">Nome owner</label>
                        <InputText
                            id="setup-owner-name" v-model="form.ownerName"
                            autocomplete="name"
                            placeholder="Es. Lorenzo Rossi"
                            :invalid="!!errors.ownerName"
                            :aria-describedby="errors.ownerName ? 'setup-owner-name-err' : 'setup-owner-name-hint'"
                            :disabled="submitting"
                        />
                        <span v-if="!errors.ownerName" id="setup-owner-name-hint" class="login__hint">
                            Tu: il primo utente del tenant, con privilegi di amministratore.
                        </span>
                        <span v-if="errors.ownerName" id="setup-owner-name-err" class="login__error">
                            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.ownerName }}
                        </span>
                    </div>
                </template>

                <!-- Campi solo PAIR -->
                <template v-if="mode === 'pair'">
                    <div class="login__field">
                        <label for="login-invite" class="login__label">Codice invito</label>
                        <InputText
                            id="login-invite" v-model="form.inviteCode"
                            autocomplete="off" spellcheck="false"
                            :invalid="!!errors.inviteCode"
                            :aria-describedby="errors.inviteCode ? 'login-invite-err' : undefined"
                            :disabled="submitting"
                        />
                        <span v-if="errors.inviteCode" id="login-invite-err" class="login__error">
                            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.inviteCode }}
                        </span>
                        <button type="button" class="login__link-button"
                                @click="toggleRecovery" :disabled="submitting">
                            <i class="pi pi-shield" aria-hidden="true"></i>
                            {{ recoveryOpen ? 'Annulla recupero' : 'Hai perso il codice invito?' }}
                        </button>
                    </div>

                    <!-- Pannello recovery: rigenera l'invite con admin pwd. -->
                    <div v-if="recoveryOpen" class="login__recovery" role="region" aria-label="Recupero codice invito">
                        <p class="login__recovery-intro">
                            <i class="pi pi-info-circle" aria-hidden="true"></i>
                            Se conosci la <strong>password amministratore</strong> del tenant possiamo
                            generarne uno nuovo. Il vecchio codice (anche se ce l'hai) verra' invalidato.
                        </p>
                        <div class="login__field">
                            <label for="recovery-tenant" class="login__label">Nome tenant</label>
                            <InputText
                                id="recovery-tenant" v-model="recoveryForm.tenantName"
                                placeholder="Es. Casa Cremisi"
                                :disabled="recoveryLoading"
                            />
                            <span class="login__hint">
                                Il nome scelto al primo setup del server.
                            </span>
                        </div>
                        <div class="login__field">
                            <label for="recovery-admin" class="login__label">Password amministratore tenant</label>
                            <Password
                                input-id="recovery-admin" v-model="recoveryForm.adminPassword"
                                :feedback="false" toggle-mask autocomplete="off"
                                :disabled="recoveryLoading"
                                :input-style="{ width: '100%' }"
                                :pt="{ root: { style: 'width: 100%' } }"
                            />
                        </div>
                        <div v-if="recoveryError" class="login__alert" role="alert" aria-live="assertive"
                             style="margin: 0.25rem 0;">
                            <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                            <span>{{ recoveryError }}</span>
                        </div>
                        <div v-if="recoverySuccess" class="login__alert" role="status" aria-live="polite"
                             style="margin: 0.25rem 0;background: var(--p-green-50, #ecfdf5); color: var(--p-green-900, #064e3b); border-color: var(--p-green-300, #6ee7b7);">
                            <i class="pi pi-check-circle" aria-hidden="true"></i>
                            <span>{{ recoverySuccess }}</span>
                        </div>
                        <Button type="button" label="Recupera codice"
                                icon="pi pi-refresh" severity="secondary"
                                :loading="recoveryLoading" @click="submitRecovery" />
                    </div>

                    <div class="login__field">
                        <label for="login-device" class="login__label">Nome dispositivo (opzionale)</label>
                        <InputText
                            id="login-device" v-model="form.deviceName"
                            autocomplete="off" placeholder="Es. PC studio"
                            :disabled="submitting"
                        />
                    </div>
                </template>

                <!-- Admin password: SETUP remoto la SCEGLIE, PAIR la CHIEDE.
                     In locale viene generata e custodita dall'app. -->
                <template v-if="mode === 'pair' || (mode === 'setup' && setupTarget === 'remote')">
                    <div class="login__field">
                        <label for="login-admin" class="login__label">
                            {{ mode === 'setup' ? 'Password amministratore tenant (≥12)' : 'Password amministratore tenant' }}
                        </label>
                        <Password
                            input-id="login-admin" v-model="form.adminPassword"
                            :feedback="mode === 'setup'" toggle-mask autocomplete="off"
                            :invalid="!!errors.adminPassword"
                            :aria-describedby="errors.adminPassword ? 'login-admin-err' : 'login-admin-hint'"
                            :disabled="submitting"
                            :input-style="{ width: '100%' }"
                            :pt="{ root: { style: 'width: 100%' } }"
                        />
                        <span v-if="!errors.adminPassword && mode === 'setup'"
                              id="login-admin-hint" class="login__hint">
                            Cifra la chiave del CA del tenant. <strong>Non recuperabile</strong>: salvala in un password manager.
                        </span>
                        <span v-if="errors.adminPassword" id="login-admin-err" class="login__error">
                            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.adminPassword }}
                        </span>
                    </div>
                </template>

                <!-- Email + password (login user; in setup è l'owner) -->
                <div class="login__field">
                    <label for="login-email" class="login__label">
                        {{ mode === 'setup' ? 'Email owner' : 'Email' }}
                    </label>
                    <InputText
                        id="login-email" v-model="form.email"
                        type="email" autocomplete="username"
                        :invalid="!!errors.email"
                        :aria-describedby="errors.email ? 'login-email-err' : undefined"
                        :disabled="submitting"
                    />
                    <span v-if="errors.email" id="login-email-err" class="login__error">
                        <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.email }}
                    </span>
                </div>

                <div class="login__field">
                    <label for="login-pwd" class="login__label">
                        {{ mode === 'setup' ? 'Password owner (≥8)' : 'Password' }}
                    </label>
                    <Password
                        input-id="login-pwd" v-model="form.password"
                        :feedback="mode === 'setup'" toggle-mask
                        :autocomplete="mode === 'setup' ? 'new-password' : 'current-password'"
                        :invalid="!!errors.password"
                        :aria-describedby="errors.password ? 'login-pwd-err' : undefined"
                        :disabled="submitting"
                        :input-style="{ width: '100%' }"
                        :pt="{ root: { style: 'width: 100%' } }"
                    />
                    <span v-if="errors.password" id="login-pwd-err" class="login__error">
                        <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.password }}
                    </span>
                </div>

                <div v-if="mode === 'login'" class="login__row">
                    <label class="login__remember"
                           style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;cursor:pointer;">
                        <Checkbox v-model="form.remember" :binary="true" input-id="login-remember" />
                        <span>Ricordami su questo dispositivo</span>
                    </label>
                </div>

                <Button
                    type="submit"
                    :label="submitLabel"
                    :icon="submitIcon"
                    class="login__submit"
                    :loading="submitting"
                />

                <div class="login__divider">oppure</div>

                <div class="login__alt" style="display:flex;flex-direction:column;gap:0.5rem;">
                    <!-- LOGIN: passa al pairing o crea un nuovo tenant. -->
                    <Button v-if="mode === 'login'"
                        type="button" label="Usa un altro account / ri-associa"
                        icon="pi pi-refresh" severity="secondary" outlined
                        @click="useAnotherAccount" :disabled="submitting" />
                    <Button v-if="mode === 'login'"
                        type="button" label="Crea una nuova libreria"
                        icon="pi pi-cog" severity="secondary" outlined
                        @click="gotoSetup" :disabled="submitting" />

                    <!-- PAIR: "Torna al login" solo se esiste gia' un cert
                         paired (altrimenti il form di login fallirebbe con
                         "no session: bootstrap required"). Senza cert l'unica
                         exit sensata e' SETUP. -->
                    <Button v-if="mode === 'pair' && auth.session.has_cert"
                        type="button" label="Torna al login"
                        icon="pi pi-arrow-left" severity="secondary" outlined
                        @click="backToLogin" :disabled="submitting" />
                    <Button v-if="mode === 'pair'"
                        type="button" label="Crea una nuova libreria"
                        icon="pi pi-cog" severity="secondary" outlined
                        @click="gotoSetup" :disabled="submitting" />

                    <!-- SETUP: due exit point. "Ho gia' un tenant" porta
                         dritto al pairing; "Torna al login" solo se c'e'
                         un cert valido. -->
                    <Button v-if="mode === 'setup'"
                        type="button" label="Ho già un tenant (associa)"
                        icon="pi pi-key" severity="secondary" outlined
                        @click="mode = 'pair'" :disabled="submitting" />
                    <Button v-if="mode === 'setup' && auth.session.has_cert"
                        type="button" label="Torna al login"
                        icon="pi pi-arrow-left" severity="secondary" outlined
                        @click="backToLogin" :disabled="submitting" />

                    <Button
                        type="button" label="Associa da mobile (QR)"
                        icon="pi pi-qrcode" severity="secondary" outlined
                        @click="pairMobile" :disabled="submitting" />
                </div>

                <p class="login__footer-text">
                    Non hai ancora un server? <a href="#">Guida al self-hosting</a>
                </p>
            </form>
        </section>
    </div>
</template>
