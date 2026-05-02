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

import { computed, onMounted, reactive, ref } from 'vue';
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

const themeIcon = computed(() => {
    if (ui.mode === 'system') return 'pi pi-desktop';
    return ui.isDark ? 'pi pi-sun' : 'pi pi-moon';
});

const titleText = computed(() => {
    switch (mode.value) {
        case 'setup': return 'Configura il tuo server';
        case 'pair':  return 'Associa questo dispositivo';
        default:      return 'Bentornato';
    }
});
const subtitleText = computed(() => {
    switch (mode.value) {
        case 'setup':
            return 'Primo avvio: crea il tenant e l\'utente proprietario sul tuo server Bookeeper.';
        case 'pair':
            return 'Genera un certificato client per il primo accesso al tuo server Bookeeper.';
        default:
            return `Accedi al server ${auth.serverURL || 'configurato'}.`;
    }
});
const submitLabel = computed(() => {
    switch (mode.value) {
        case 'setup': return 'Crea tenant';
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

onMounted(() => {
    // Decidi la modalità iniziale in base allo stato della sessione:
    //   - Nessun cert paired → PAIR (primo avvio o post-wipe).
    //   - Cert presente (con o senza tokens validi) → LOGIN (l'utente
    //     deve solo riautenticarsi, niente nuovo pairing).
    if (!auth.session.has_cert) {
        mode.value = 'pair';
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

    if (mode.value === 'pair' || mode.value === 'setup') {
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
        if (!form.tenantName.trim()) { errors.tenantName = 'Nome tenant obbligatorio'; ok = false; }
        if (form.adminPassword.length < 12) {
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
        if (mode.value === 'setup') {
            const res = await auth.setupTenant({
                serverUrl: form.serverUrl.trim(),
                bootstrapUrl: form.bootstrapUrl.trim() || undefined,
                tenantName: form.tenantName.trim(),
                adminPassword: form.adminPassword,
                ownerEmail: form.email.trim(),
                ownerName: form.ownerName.trim(),
                ownerPassword: form.password,
            });
            // Setup riuscito → switch a PAIR pre-popolato.
            setupResult.value = { inviteCode: res.invite_code, tenantId: res.tenant_id };
            form.inviteCode = res.invite_code;
            mode.value = 'pair';
            // adminPassword resta in memoria perché serve subito al PAIR.
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

                <!-- URL server: visibile sia in PAIR che in SETUP -->
                <template v-if="mode === 'pair' || mode === 'setup'">
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

                    <details open class="login__field"
                             style="border:1px solid var(--p-content-border-color);border-radius:0.5rem;padding:0.5rem 0.75rem;">
                        <summary style="cursor:pointer;font-size:0.8125rem;color:var(--p-text-muted-color);">
                            URL bootstrap (separato dal Server URL)
                        </summary>
                        <div style="display:flex;flex-direction:column;gap:0.375rem;margin-top:0.5rem;">
                            <label for="login-bootstrap" class="login__label">Bootstrap URL</label>
                            <InputText
                                id="login-bootstrap" v-model="form.bootstrapUrl"
                                type="url" autocomplete="url" spellcheck="false"
                                placeholder="https://bookeeper.tail22adce.ts.net"
                                :disabled="submitting"
                            />
                            <span class="login__hint">
                                <strong>Obbligatorio</strong> se il tuo server espone il pairing solo su una rete privata (tailnet, VPN, LAN).
                                Il dominio pubblico mTLS chiude la connessione (<code>EOF</code> / 400) durante il pairing.
                                Lascia vuoto solo se il server espone <code>/setup</code> e <code>/pairing</code> sullo stesso host del Server URL.
                            </span>
                        </div>
                    </details>
                </template>

                <!-- Campi solo SETUP -->
                <template v-if="mode === 'setup'">
                    <div class="login__field">
                        <label for="setup-tenant" class="login__label">Nome tenant</label>
                        <InputText
                            id="setup-tenant" v-model="form.tenantName"
                            placeholder="Es. Casa Cremisi"
                            :invalid="!!errors.tenantName"
                            :aria-describedby="errors.tenantName ? 'setup-tenant-err' : undefined"
                            :disabled="submitting"
                        />
                        <span v-if="errors.tenantName" id="setup-tenant-err" class="login__error">
                            <i class="pi pi-times-circle" aria-hidden="true"></i>{{ errors.tenantName }}
                        </span>
                    </div>
                    <div class="login__field">
                        <label for="setup-owner-name" class="login__label">Nome owner</label>
                        <InputText
                            id="setup-owner-name" v-model="form.ownerName"
                            autocomplete="name"
                            :invalid="!!errors.ownerName"
                            :aria-describedby="errors.ownerName ? 'setup-owner-name-err' : undefined"
                            :disabled="submitting"
                        />
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

                <!-- Admin password: SETUP la SCEGLIE, PAIR la CHIEDE -->
                <template v-if="mode === 'pair' || mode === 'setup'">
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
                    <Button v-if="mode === 'login'"
                        type="button" label="Usa un altro account / ri-associa"
                        icon="pi pi-refresh" severity="secondary" outlined
                        @click="useAnotherAccount" :disabled="submitting" />
                    <Button v-if="mode === 'pair' && auth.session.server_url"
                        type="button" label="Torna al login"
                        icon="pi pi-arrow-left" severity="secondary" outlined
                        @click="mode = 'login'" :disabled="submitting" />
                    <Button v-if="mode === 'setup'"
                        type="button" label="Ho già un tenant (associa)"
                        icon="pi pi-arrow-left" severity="secondary" outlined
                        @click="mode = 'pair'" :disabled="submitting" />
                    <Button v-if="mode === 'pair'"
                        type="button" label="Configura un nuovo server"
                        icon="pi pi-cog" severity="secondary" outlined
                        @click="gotoSetup" :disabled="submitting" />
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
