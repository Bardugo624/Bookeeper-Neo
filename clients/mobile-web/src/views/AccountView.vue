<script setup lang="ts">
/**
 * Account tab. Already wired in Phase B because:
 *   - Shows the freshly paired device name (proof the redeem worked).
 *   - Lets the user rename it (PATCH endpoint deferred to Phase D; for now
 *     local-only via keystore.updateName so the UI is testable).
 *   - Hosts the "Add to Home Screen" prompt (placement decided in plan).
 *   - Wipes credentials on logout, returning to /pair/required.
 */
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const editing = ref(false);
const draftName = ref('');

function startEdit(): void {
    draftName.value = auth.deviceName ?? '';
    editing.value = true;
}

async function saveName(): Promise<void> {
    const next = draftName.value.trim();
    if (next && next !== auth.deviceName) {
        await auth.rename(next);
    }
    editing.value = false;
}

function cancelEdit(): void {
    editing.value = false;
}

const pairedHuman = computed(() => {
    if (!auth.pairedAt) return '';
    return new Date(auth.pairedAt).toLocaleString('it-IT', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
});

// --- Install prompt (PWA "Add to Home Screen") ---------------------------
// `beforeinstallprompt` is captured globally; we expose a button that
// triggers `prompt()` on user gesture (browsers refuse otherwise).

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const installEvent = ref<BeforeInstallPromptEvent | null>(null);
const installed = ref(
    window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
);

function captureInstallPrompt(e: Event): void {
    e.preventDefault();
    installEvent.value = e as BeforeInstallPromptEvent;
}

function captureInstalled(): void {
    installed.value = true;
    installEvent.value = null;
}

onMounted(() => {
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', captureInstalled);
});

onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
    window.removeEventListener('appinstalled', captureInstalled);
});

async function triggerInstall(): Promise<void> {
    const ev = installEvent.value;
    if (!ev) return;
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice.outcome === 'accepted') installed.value = true;
    installEvent.value = null;
}

async function logout(): Promise<void> {
    await auth.wipe();
    router.replace({ name: 'pair-required' });
}
</script>

<template>
    <section class="tab" aria-labelledby="tab-account-title">
        <header class="tab__header">
            <h1 id="tab-account-title" class="tab__title">Account</h1>
            <p class="tab__sub">Dispositivo abbinato a Bookeeper</p>
        </header>

        <div class="tab__body">
            <!-- Device card -->
            <article class="card" aria-labelledby="card-device-title">
                <div class="card__row">
                    <div>
                        <p id="card-device-title" class="card__label">Nome dispositivo</p>
                        <p v-if="!editing" class="card__value">{{ auth.deviceName }}</p>
                        <div v-else class="card__edit">
                            <InputText
                                v-model="draftName"
                                autofocus
                                maxlength="40"
                                class="card__input"
                                aria-label="Nome dispositivo"
                                @keydown.enter="saveName"
                                @keydown.escape="cancelEdit"
                            />
                        </div>
                    </div>
                    <div class="card__actions">
                        <Button
                            v-if="!editing"
                            icon="pi pi-pencil"
                            severity="secondary"
                            text
                            rounded
                            aria-label="Modifica nome"
                            @click="startEdit"
                        />
                        <template v-else>
                            <Button
                                icon="pi pi-check"
                                severity="success"
                                text
                                rounded
                                aria-label="Salva"
                                @click="saveName"
                            />
                            <Button
                                icon="pi pi-times"
                                severity="secondary"
                                text
                                rounded
                                aria-label="Annulla"
                                @click="cancelEdit"
                            />
                        </template>
                    </div>
                </div>
                <div class="card__divider" />
                <dl class="card__meta">
                    <div>
                        <dt>ID dispositivo</dt>
                        <dd>
                            <code>{{ auth.deviceId }}</code>
                        </dd>
                    </div>
                    <div>
                        <dt>Abbinato il</dt>
                        <dd>{{ pairedHuman }}</dd>
                    </div>
                </dl>
            </article>

            <!-- Install prompt card (only when offered and not yet installed) -->
            <article
                v-if="!installed && installEvent"
                class="card card--accent"
                aria-labelledby="card-install-title"
            >
                <div class="card__icon" aria-hidden="true">
                    <i class="pi pi-download" />
                </div>
                <div>
                    <p id="card-install-title" class="card__label">Installa come app</p>
                    <p class="card__hint">
                        Aggiungi Bookeeper alla schermata home per aprirla a schermo intero,
                        senza barra del browser.
                    </p>
                </div>
                <Button
                    label="Installa"
                    icon="pi pi-arrow-down"
                    @click="triggerInstall"
                />
            </article>

            <article v-else-if="installed" class="card card--ok" aria-live="polite">
                <i class="pi pi-check-circle card__icon-inline" aria-hidden="true" />
                <p>App installata sulla schermata home.</p>
            </article>

            <!-- Danger zone: logout -->
            <Button
                label="Disconnetti dispositivo"
                icon="pi pi-sign-out"
                severity="danger"
                outlined
                class="logout"
                @click="logout"
            />
            <p class="logout__hint">
                Cancella le credenziali da questo telefono. Servirà rifare l'abbinamento dal desktop.
            </p>
        </div>
    </section>
</template>

<style scoped>
@import './_tab.css';

.tab__body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0 1rem;
}

.card {
    background: var(--p-surface-0);
    border: 1px solid var(--p-surface-200);
    border-radius: 12px;
    padding: 1rem 1.125rem;
}

.card__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
}

.card__label {
    margin: 0 0 0.25rem;
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.card__value {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.card__hint {
    margin: 0.25rem 0 0;
    color: var(--p-text-muted-color);
    font-size: 0.9rem;
    line-height: 1.5;
}

.card__edit {
    margin-top: 0.25rem;
}

.card__input {
    width: 100%;
    min-height: 44px;
}

.card__actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
}

.card__divider {
    height: 1px;
    background: var(--p-surface-200);
    margin: 0.875rem 0;
}

.card__meta {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    margin: 0;
}

.card__meta > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.85rem;
}

.card__meta dt {
    color: var(--p-text-muted-color);
    margin: 0;
}

.card__meta dd {
    margin: 0;
    color: var(--p-text-color);
    text-align: right;
    word-break: break-all;
    max-width: 60%;
}

.card__meta code {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.78rem;
    background: var(--p-surface-100);
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
}

/* Install prompt — accent card */
.card--accent {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 0.5rem 0.875rem;
    background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--p-primary-500) 8%, var(--p-surface-0)) 0%,
        var(--p-surface-0) 100%
    );
    border-color: var(--p-primary-200);
}

.card--accent > .card__icon {
    grid-row: span 2;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--p-primary-100);
    color: var(--p-primary-700);
    display: grid;
    place-items: center;
    font-size: 1.1rem;
}

.card--accent > :nth-child(3) {
    grid-column: 1 / -1;
    margin-top: 0.5rem;
    min-height: 44px;
}

.card--ok {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    background: color-mix(in srgb, var(--p-green-500) 8%, var(--p-surface-0));
    border-color: color-mix(in srgb, var(--p-green-500) 25%, transparent);
    color: var(--p-text-color);
}

.card--ok p {
    margin: 0;
    font-size: 0.9rem;
}

.card__icon-inline {
    color: var(--p-green-600);
    font-size: 1.2rem;
}

.logout {
    margin-top: 0.5rem;
    min-height: 48px;
}

.logout__hint {
    margin: 0;
    text-align: center;
    color: var(--p-text-muted-color);
    font-size: 0.78rem;
    line-height: 1.5;
}
</style>
