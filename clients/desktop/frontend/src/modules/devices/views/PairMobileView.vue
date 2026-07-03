<script setup lang="ts">
/**
 * PairMobileView — abbina il companion mobile via QR.
 *
 * Decisioni UX:
 *  - Token one-shot, TTL 10 minuti (lato server). Il QR codifica un URL
 *    `https://<host>/m/?pair=<token>`: la fotocamera nativa lo riconosce
 *    come link, l'utente tocca la notifica → si apre la PWA che redime il
 *    token e salva le credenziali.
 *  - Mostriamo sempre un countdown MM:SS sotto il QR (HIG: time-aware
 *    affordance). Sotto il 10% del TTL il countdown diventa color warning.
 *  - Alla scadenza: blur del QR + overlay con bottone primario "Genera nuovo".
 *    Niente auto-rigenerazione silenziosa: vogliamo che l'utente sappia
 *    perché l'esperienza cambia.
 *  - Bottone "Rigenera" sempre visibile come azione secondary, perché:
 *    * il token è one-shot — se l'utente sospetta che sia stato visto
 *      da terzi vuole poter ricominciare in 1 click.
 *    * se torna in pagina dopo aver chiuso, è probabile che il token sia
 *      vicino alla scadenza. Lo aiutiamo subito.
 *  - Polling: ogni 2s su /pairing-token/{token}/status. Quando `used:true`
 *    sostituiamo il QR con uno stato "✓ Dispositivo abbinato" e dopo 1.5s
 *    chiudiamo tornando a /devices.
 *  - Cleanup: stop polling on unmount; clear interval on token change.
 */
import {
    computed,
    onMounted,
    onUnmounted,
    ref,
    shallowRef,
    watch,
} from 'vue';
import { useRouter } from 'vue-router';
import QRCode from 'qrcode';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { devicesEndpoints, type PairingToken } from '@/lib/api/endpoints/devices';
import { ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

// Modalità "libreria locale": il server gira su 127.0.0.1, che il telefono
// non può raggiungere. Il QR sarebbe un vicolo cieco: meglio dirlo chiaro
// e non generare nemmeno il token.
const isLocal = computed(() => auth.session.local);

const token = shallowRef<PairingToken | null>(null);
const qrDataUrl = ref<string>('');
const loading = ref(true);
const error = ref<string | null>(null);
const now = ref(Date.now());
const pairedDeviceName = ref<string | null>(null);

// CA locked panel — visibile solo la prima volta dopo un deploy: il server
// non ha ancora popolato lo slot di auto-unlock per questo tenant. Un admin
// inserisce la password una volta sola, da quel momento in poi nessun
// utente (admin o no) la dovra' piu' digitare.
const caLocked = ref(false);
const adminPassword = ref('');
const unlocking = ref(false);
const unlockError = ref<string | null>(null);

let tickInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let closeTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Countdown -------------------------------------------------------------

// Server invia expires_at in **secondi** Unix (int64), convertiamo a ms.
const expiresAt = computed(() =>
    token.value ? token.value.expires_at * 1000 : 0,
);
const totalMs = computed(() => {
    // We don't get TTL back; assume server-config 10min unless future API
    // exposes it. Used only to color the bar (warning threshold).
    return 10 * 60 * 1000;
});
const remainingMs = computed(() =>
    expiresAt.value ? Math.max(0, expiresAt.value - now.value) : 0,
);
const expired = computed(() => !!token.value && remainingMs.value === 0);
const remainingPct = computed(() =>
    totalMs.value ? (remainingMs.value / totalMs.value) * 100 : 0,
);
const warning = computed(() => remainingPct.value > 0 && remainingPct.value < 10);

const countdownLabel = computed(() => {
    const ms = remainingMs.value;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
});

// --- QR rendering ----------------------------------------------------------

async function renderQR(payload: string): Promise<void> {
    qrDataUrl.value = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#1f2937', light: '#ffffff' },
    });
}

// --- Lifecycle of a token --------------------------------------------------

async function generate(): Promise<void> {
    loading.value = true;
    error.value = null;
    pairedDeviceName.value = null;
    stopPolling();
    try {
        const t = await devicesEndpoints.createPairingToken();
        token.value = t;
        caLocked.value = false;
        await renderQR(t.qr_payload);
        startPolling();
    } catch (e) {
        // 503 = CA non sbloccata in memoria. Caso uno-tantum su tenant
        // legacy: mostriamo il pannello admin invece dell'errore generico.
        if (e instanceof ApiError && e.status === 503) {
            caLocked.value = true;
            token.value = null;
            qrDataUrl.value = '';
        } else {
            error.value =
                e instanceof Error ? e.message : 'Impossibile generare il QR.';
            token.value = null;
            qrDataUrl.value = '';
        }
    } finally {
        loading.value = false;
    }
}

async function unlockCA(): Promise<void> {
    if (!adminPassword.value) return;
    unlocking.value = true;
    unlockError.value = null;
    try {
        await devicesEndpoints.caUnlock(adminPassword.value);
        adminPassword.value = '';
        caLocked.value = false;
        await generate();
    } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
            unlockError.value = 'Admin password non valida.';
        } else {
            unlockError.value =
                e instanceof Error ? e.message : 'Sblocco fallito.';
        }
    } finally {
        unlocking.value = false;
    }
}

function startPolling(): void {
    stopPolling();
    pollInterval = setInterval(async () => {
        const t = token.value;
        if (!t || expired.value) return;
        try {
            const status = await devicesEndpoints.getPairingTokenStatus(t.token);
            if (status.used) {
                pairedDeviceName.value = status.device_name ?? 'Dispositivo';
                stopPolling();
                closeTimeout = setTimeout(() => {
                    router.replace({ name: 'devices' });
                }, 1500);
            }
        } catch {
            // Silenzioso: errori transitori di rete sono normali, riproviamo
            // al prossimo tick. Mostriamo banner solo su fallimento iniziale.
        }
    }, 2000);
}

function stopPolling(): void {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
    }
}

// Quando un token scade ferma il polling per non sprecare richieste.
watch(expired, (isExpired) => {
    if (isExpired) stopPolling();
});

onMounted(() => {
    if (isLocal.value) {
        loading.value = false;
        return;
    }
    tickInterval = setInterval(() => {
        now.value = Date.now();
    }, 1000);
    void generate();
});

onUnmounted(() => {
    if (tickInterval) clearInterval(tickInterval);
    stopPolling();
});

function back(): void {
    router.push({ name: 'devices' });
}
</script>

<template>
    <div class="pair">
        <header class="pair__header">
            <Button
                icon="pi pi-arrow-left"
                text
                rounded
                aria-label="Indietro"
                @click="back"
            />
            <div>
                <h1 class="pair__title">Abbina mobile</h1>
                <p class="pair__sub">
                    Scansiona il QR con la fotocamera del telefono.
                </p>
            </div>
        </header>

        <!-- Modalità libreria locale: il telefono non può raggiungere
             127.0.0.1 — niente QR, spiegazione onesta e via d'uscita. -->
        <div v-if="isLocal" class="pair__local-note" role="status">
            <span class="pair__local-icon" aria-hidden="true">
                <i class="pi pi-desktop"></i>
            </span>
            <div class="pair__local-body">
                <h2 class="pair__local-title">Non disponibile con la libreria locale</h2>
                <p class="pair__local-text">
                    La tua libreria vive solo su questo computer
                    (<code>127.0.0.1</code>): il telefono non può raggiungerla,
                    quindi l'abbinamento mobile non funzionerebbe.
                </p>
                <p class="pair__local-text">
                    Per usare Bookeeper dal telefono serve una libreria su un
                    server raggiungibile in rete (NAS, Raspberry, VPS): vedi le
                    guide in <code>deploy/</code> del progetto.
                </p>
                <Button
                    label="Torna ai dispositivi"
                    icon="pi pi-arrow-left"
                    severity="secondary"
                    outlined
                    @click="back"
                />
            </div>
        </div>

        <div v-else class="pair__layout">
            <!-- QR card -->
            <section
                class="qr-card"
                :class="{ 'qr-card--paired': pairedDeviceName }"
                aria-live="polite"
            >
                <!-- Stato successo -->
                <div v-if="pairedDeviceName" class="qr-card__success">
                    <div class="qr-card__check" aria-hidden="true">
                        <svg viewBox="0 0 32 32">
                            <path
                                d="M8 16 L14 22 L24 10"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </div>
                    <p class="qr-card__success-title">Dispositivo abbinato</p>
                    <p class="qr-card__success-name">{{ pairedDeviceName }}</p>
                    <small>Apertura lista in corso…</small>
                </div>

                <!-- CA bloccata: prompt admin password (one-shot per tenant) -->
                <div v-else-if="caLocked" class="qr-card__locked">
                    <div class="qr-card__lock-icon" aria-hidden="true">
                        <i class="pi pi-lock" />
                    </div>
                    <p class="qr-card__locked-title">Sblocca la CA del tenant</p>
                    <p class="qr-card__locked-sub">
                        Operazione necessaria una sola volta dopo l'aggiornamento
                        del server. Da ora in poi qualsiasi utente potrà
                        abbinare un dispositivo mobile senza inserire password.
                    </p>
                    <form class="qr-card__locked-form" @submit.prevent="unlockCA">
                        <Password
                            v-model="adminPassword"
                            placeholder="Admin password"
                            :feedback="false"
                            toggle-mask
                            :disabled="unlocking"
                            input-class="qr-card__locked-input"
                            autofocus
                        />
                        <Button
                            type="submit"
                            label="Sblocca"
                            icon="pi pi-key"
                            :loading="unlocking"
                            :disabled="!adminPassword || unlocking"
                        />
                    </form>
                    <Message
                        v-if="unlockError"
                        severity="error"
                        :closable="false"
                        class="qr-card__locked-err"
                    >
                        {{ unlockError }}
                    </Message>
                </div>

                <!-- Stato normale + scaduto -->
                <template v-else>
                    <div class="qr-card__qr-wrap">
                        <img
                            v-if="qrDataUrl"
                            :src="qrDataUrl"
                            alt="QR di abbinamento mobile"
                            class="qr-card__qr"
                            :class="{ 'qr-card__qr--blur': expired }"
                            draggable="false"
                        />
                        <div v-else-if="loading" class="qr-card__skel" aria-hidden="true" />

                        <!-- Overlay scaduto -->
                        <div v-if="expired" class="qr-card__expired" role="status">
                            <i class="pi pi-clock" aria-hidden="true" />
                            <strong>QR scaduto</strong>
                            <Button
                                label="Genera nuovo QR"
                                icon="pi pi-refresh"
                                @click="generate"
                            />
                        </div>
                    </div>

                    <!-- Countdown -->
                    <div class="qr-card__meta">
                        <div class="qr-card__time">
                            <i class="pi pi-clock" aria-hidden="true" />
                            <span :class="{ 'qr-card__time--warn': warning, 'qr-card__time--exp': expired }">
                                {{ expired ? '0:00' : countdownLabel }}
                            </span>
                            <small>tempo rimasto</small>
                        </div>
                        <div class="qr-card__bar">
                            <div
                                class="qr-card__bar-fill"
                                :class="{ 'qr-card__bar-fill--warn': warning }"
                                :style="{ transform: `scaleX(${remainingPct / 100})` }"
                            />
                        </div>
                    </div>

                    <Button
                        label="Rigenera"
                        icon="pi pi-refresh"
                        severity="secondary"
                        text
                        :disabled="loading"
                        class="qr-card__regen"
                        @click="generate"
                    />
                </template>
            </section>

            <!-- Istruzioni -->
            <section class="pair__steps">
                <h2>Come funziona</h2>
                <ol>
                    <li>
                        <span class="pair__step-num">1</span>
                        <span>
                            Apri la <strong>fotocamera</strong> del telefono e
                            inquadra il QR.
                        </span>
                    </li>
                    <li>
                        <span class="pair__step-num">2</span>
                        <span>
                            Tocca il link che appare in sovrimpressione: si aprirà
                            <strong>Bookeeper Mobile</strong> nel browser.
                        </span>
                    </li>
                    <li>
                        <span class="pair__step-num">3</span>
                        <span>
                            L'app si abbina automaticamente. Da
                            <strong>Account</strong> potrai installarla nella
                            schermata home.
                        </span>
                    </li>
                </ol>

                <Message
                    severity="info"
                    :closable="false"
                    class="pair__sec"
                    icon="pi pi-shield"
                >
                    Il codice è valido <strong>10 minuti</strong> e funziona
                    <strong>una sola volta</strong>. Se qualcuno lo intercetta dopo
                    l'uso, è già inutilizzabile.
                </Message>

                <Message
                    v-if="error"
                    severity="error"
                    :closable="true"
                    class="pair__sec"
                    @close="error = null"
                >
                    {{ error }}
                </Message>
            </section>
        </div>
    </div>
</template>

<style scoped>
.pair {
    padding: 1.5rem 2rem 2rem;
    max-width: 72rem;
    margin: 0 auto;
}

.pair__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
}

.pair__title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 600;
    /* Token semantico: flippa automaticamente in dark mode con contrasto
       garantito. Override dark sotto solo per la sfumatura primary. */
    color: var(--p-text-color);
}

.pair__sub {
    margin: 0.25rem 0 0;
    color: var(--p-text-muted-color);
}

.pair__layout {
    display: grid;
    grid-template-columns: minmax(320px, 380px) 1fr;
    gap: 2rem;
    align-items: start;
}

/* Pannello "non disponibile in locale": informativo, non un errore. */
.pair__local-note {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    max-width: 560px;
    padding: 1.25rem 1.375rem;
    background: var(--bk-surface);
    border: 1px solid var(--bk-border);
    border-radius: var(--bk-radius-lg);
}
.pair__local-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
    color: var(--p-primary-700);
    font-size: 1.125rem;
    flex-shrink: 0;
}
html.dark .pair__local-icon {
    background: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
    color: var(--p-primary-300);
}
.pair__local-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
}
.pair__local-title {
    font-family: 'Lora', Georgia, serif;
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--bk-text-strong);
}
.pair__local-text {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--bk-text-muted);
    max-width: 46ch;
}
.pair__local-text code {
    font-size: 0.8125rem;
}

@media (max-width: 720px) {
    .pair__layout {
        grid-template-columns: 1fr;
    }
}

/* --- QR card ------------------------------------------------------------ */
.qr-card {
    background: var(--p-surface-0);
    border: 1px solid var(--p-surface-200);
    border-radius: 16px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    transition: border-color 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.qr-card--paired {
    border-color: var(--p-green-400);
    background: color-mix(in srgb, var(--p-green-500) 5%, var(--p-surface-0));
}

.qr-card__qr-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    display: grid;
    place-items: center;
}

.qr-card__qr {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
    transition: filter 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.qr-card__qr--blur {
    filter: blur(6px) saturate(0.6);
}

.qr-card__skel {
    width: 80%;
    height: 80%;
    border-radius: 8px;
    background: linear-gradient(
        90deg,
        var(--p-surface-100) 0%,
        var(--p-surface-200) 50%,
        var(--p-surface-100) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
    from { background-position: -100% 0; }
    to { background-position: 200% 0; }
}

.qr-card__expired {
    position: absolute;
    inset: 0;
    /* L'overlay sta SEMPRE sopra il QR bianco (anche in dark mode il QR
       resta bianco per scannability), quindi forziamo testo scuro a
       prescindere dal tema. */
    background: rgba(255, 255, 255, 0.86);
    color: #1f2937;
    backdrop-filter: blur(2px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    text-align: center;
    padding: 1rem;
    animation: fade-in 220ms ease both;
}

.qr-card__expired i {
    font-size: 2rem;
    color: #c2410c; /* orange-700: contrast >=4.5:1 sul bianco overlay */
}

.qr-card__expired strong {
    color: inherit;
    font-size: 1.05rem;
}

@keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* --- Countdown ---------------------------------------------------------- */
.qr-card__meta {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.qr-card__time {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 1.4rem;
    color: var(--p-text-color);
    font-variant-numeric: tabular-nums;
}

.qr-card__time i {
    color: var(--p-text-muted-color);
    font-size: 1rem;
    align-self: center;
}

.qr-card__time small {
    margin-left: auto;
    font-family: var(--font-sans, system-ui);
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
    align-self: center;
}

.qr-card__time--warn {
    color: var(--p-orange-600);
}
.qr-card__time--exp {
    color: var(--p-red-600);
}

.qr-card__bar {
    height: 4px;
    border-radius: 2px;
    background: var(--p-surface-200);
    overflow: hidden;
}

.qr-card__bar-fill {
    height: 100%;
    width: 100%;
    background: var(--p-primary-500);
    transform-origin: left center;
    /* Countdown fluido: scaleX su compositor, tick da 1s interpolato. */
    transition: transform 1s linear, background-color 240ms ease;
}

.qr-card__bar-fill--warn {
    background: var(--p-orange-500);
}

.qr-card__regen {
    align-self: stretch;
}

/* --- Success state ------------------------------------------------------ */
.qr-card__success {
    text-align: center;
    padding: 1.5rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    animation: success-enter 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.qr-card__check {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--p-green-500);
    color: #fff;
    display: grid;
    place-items: center;
    margin-bottom: 0.5rem;
}

.qr-card__check svg {
    width: 44px;
    height: 44px;
}

.qr-card__check svg path {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
    animation: check-draw 420ms 120ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes check-draw {
    to { stroke-dashoffset: 0; }
}

@keyframes success-enter {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
}

.qr-card__success-title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.25rem;
    color: var(--p-text-color);
}

.qr-card__success-name {
    margin: 0;
    font-weight: 600;
    color: var(--p-primary-600);
}

/* --- CA locked state ---------------------------------------------------- */
.qr-card__locked {
    text-align: center;
    padding: 1rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    max-width: 360px;
    margin: 0 auto;
}

.qr-card__lock-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--p-amber-500) 15%, transparent);
    color: var(--p-amber-600);
    display: grid;
    place-items: center;
    font-size: 1.75rem;
}

.qr-card__locked-title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.15rem;
    color: var(--p-text-color);
}

.qr-card__locked-sub {
    margin: 0;
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    line-height: 1.4;
}

.qr-card__locked-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
}

.qr-card__locked-form :deep(.p-password),
.qr-card__locked-form :deep(.p-password input) {
    width: 100%;
}

.qr-card__locked-err {
    width: 100%;
    margin-top: 0.25rem;
}

/* --- Steps panel -------------------------------------------------------- */
.pair__steps h2 {
    margin: 0 0 1rem;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.pair__steps ol {
    list-style: none;
    margin: 0 0 1.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
}

.pair__steps li {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    color: var(--p-text-color);
    line-height: 1.55;
}

.pair__step-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--p-primary-100);
    color: var(--p-primary-700);
    font-weight: 600;
    font-size: 0.85rem;
    display: grid;
    place-items: center;
}

.pair__sec {
    margin-top: 0.75rem;
}

@media (prefers-reduced-motion: reduce) {
    .qr-card,
    .qr-card__qr,
    .qr-card__bar-fill,
    .qr-card__expired,
    .qr-card__success,
    .qr-card__check svg path,
    .qr-card__skel {
        animation: none;
        transition: none;
    }
    .qr-card__check svg path {
        stroke-dashoffset: 0;
    }
}

/* ===== Dark mode =====
   Il preset Aura non ribalta automaticamente surface-0/100/200 ne'
   primary-700/800: dobbiamo override esplicitamente per evitare card
   chiare su shell scura e titoli sotto soglia di contrasto.
   Vedi `BookFormFields.vue` e `AppShell.css` per lo stesso pattern. */
</style>

<!-- Vedi BookFormFields.vue per la nota sul bug `:global(html.dark)` in
     scoped CSS: gli override dark vanno in un secondo <style> non-scoped. -->
<style>
html.dark .pair__title {
    color: var(--p-surface-50);
}
html.dark .qr-card {
    background: var(--p-surface-800);
    border-color: var(--p-surface-700);
}
html.dark .qr-card--paired {
    border-color: var(--p-green-400);
    background: color-mix(in oklab, var(--p-green-500) 14%, var(--p-surface-800));
}
html.dark .qr-card__skel {
    background: linear-gradient(
        90deg,
        var(--p-surface-700) 0%,
        var(--p-surface-600) 50%,
        var(--p-surface-700) 100%
    );
}
html.dark .qr-card__bar {
    background: var(--p-surface-700);
}
html.dark .qr-card__time--warn {
    /* orange-600 puro su surface-800 ha contrasto borderline; usiamo 400 */
    color: var(--p-orange-400);
}
html.dark .qr-card__time--exp {
    color: var(--p-red-400);
}
html.dark .qr-card__success-name {
    color: var(--p-primary-300);
}
html.dark .pair__step-num {
    background: color-mix(in oklab, var(--p-primary-500) 22%, transparent);
    color: var(--p-primary-200);
}
</style>
