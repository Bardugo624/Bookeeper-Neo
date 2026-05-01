<script setup lang="ts">
/**
 * SettingsView — pannello impostazioni a tab.
 *
 *  - Account: identità di sessione (email, deviceID, serverURL),
 *    logout soft (mantiene il cert) e wipe distruttivo del device.
 *  - Tenant: nome, invite_code (riveal/copia, rotazione),
 *    fingerprint del CA, info owner.
 *
 * Tutto rispetta le UX rules globali: focus visibile, contrasto >=4.5:1,
 * tap target >=44px, aria-live su esito, password con toggle, azione
 * distruttiva separata e confermata.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import Password from 'primevue/password';
import InputText from 'primevue/inputtext';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useAuthStore } from '@/stores/auth';
import { tenantEndpoints, type TenantInfo } from '@/lib/api/endpoints/tenant';
import { keystore } from '@/lib/keystore';

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---------- Tenant tab ----------
const tenant = ref<TenantInfo | null>(null);
const tenantLoading = ref(false);
const tenantError = ref<string | null>(null);
const inviteVisible = ref(false);

async function loadTenant() {
    tenantLoading.value = true;
    tenantError.value = null;
    try {
        tenant.value = await tenantEndpoints.get();
    } catch (e) {
        tenantError.value = e instanceof Error ? e.message : 'Errore caricamento tenant';
    } finally {
        tenantLoading.value = false;
    }
}

const inviteDisplay = computed(() => {
    if (!tenant.value) return '';
    if (inviteVisible.value) return tenant.value.invite_code;
    return '\u2022'.repeat(Math.max(8, tenant.value.invite_code.length));
});

const fingerprintShort = computed(() => {
    const fp = tenant.value?.ca_fingerprint ?? '';
    if (fp.length < 16) return fp;
    return fp.slice(0, 8) + ':\u2026:' + fp.slice(-8);
});

function fmtDate(unix: number): string {
    if (!unix) return '\u2014';
    return new Date(unix * 1000).toLocaleString();
}

async function copyText(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.add({ severity: 'success', summary: 'Copiato', detail: label, life: 2000 });
    } catch {
        toast.add({ severity: 'warn', summary: 'Copia non riuscita', life: 2500 });
    }
}

// ---------- Rotate invite dialog ----------
const rotateOpen = ref(false);const rotatePassword = ref('');
const rotating = ref(false);
const rotateError = ref<string | null>(null);

function openRotate() {
    rotatePassword.value = '';
    rotateError.value = null;
    rotateOpen.value = true;
}

async function rotateInvite() {
    rotateError.value = null;
    if (rotatePassword.value.length < 12) {
        rotateError.value = 'La password admin deve avere almeno 12 caratteri.';
        return;
    }
    rotating.value = true;
    try {
        const res = await tenantEndpoints.rotateInvite(rotatePassword.value);
        if (tenant.value) tenant.value.invite_code = res.invite_code;
        inviteVisible.value = true;
        rotateOpen.value = false;
        toast.add({
            severity: 'success',
            summary: 'Invite code rigenerato',
            detail: 'Aggiorna i dispositivi che dovranno fare pairing.',
            life: 4000,
        });
    } catch (e) {
        rotateError.value = e instanceof Error ? e.message : 'Errore rigenerazione';
    } finally {
        rotating.value = false;
        rotatePassword.value = '';
    }
}

// ---------- Reload trust dialog ----------
const reloadOpen = ref(false);
const reloadPassword = ref('');
const reloadBootstrapUrl = ref('');
const reloading = ref(false);
const reloadError = ref<string | null>(null);

function openReload() {
    reloadPassword.value = '';
    reloadError.value = null;
    // Default: stesso host del Server URL (mTLS). L'utente lo cambia se
    // il bootstrap e' raggiungibile solo via tailnet/VPN.
    reloadBootstrapUrl.value = auth.session.server_url || '';
    reloadOpen.value = true;
}

async function doReloadTrust() {
    reloadError.value = null;
    if (reloadPassword.value.length < 12) {
        reloadError.value = 'Password admin almeno 12 caratteri.';
        return;
    }
    reloading.value = true;
    try {
        await keystore.reloadTrust({
            adminPassword: reloadPassword.value,
            bootstrapUrl: reloadBootstrapUrl.value.trim() || undefined,
        });
        reloadOpen.value = false;
        toast.add({
            severity: 'success',
            summary: 'Trust pool ricaricato',
            detail: 'Caddy ha riletto i certificati. Ritenta il login.',
            life: 4000,
        });
    } catch (e) {
        reloadError.value = e instanceof Error ? e.message : String(e);
    } finally {
        reloading.value = false;
        reloadPassword.value = '';
    }
}

// ---------- Account tab actions ----------
const loggingOut = ref(false);

async function doLogout() {
    loggingOut.value = true;
    try {
        await auth.logout();
        toast.add({
            severity: 'info',
            summary: 'Logout effettuato',
            detail: 'Il certificato e stato mantenuto: potrai rientrare con email + password.',
            life: 3000,
        });
        router.push('/login');
    } finally {
        loggingOut.value = false;
    }
}

function confirmWipe() {
    confirm.require({
        header: 'Rimuovere questo dispositivo?',
        message:
            'Verranno cancellati certificato, chiave privata e token di sessione. ' +
            'Per rientrare dovrai ri-fare il pairing con un nuovo invite code.',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Rimuovi',
        rejectLabel: 'Annulla',
        acceptProps: { severity: 'danger', icon: 'pi pi-trash' },
        rejectProps: { severity: 'secondary', outlined: true },
        accept: async () => {
            await auth.wipe();
            toast.add({
                severity: 'success',
                summary: 'Dispositivo rimosso',
                life: 2500,
            });
            router.push('/login');
        },
    });
}

onMounted(loadTenant);
</script>

<template>
    <div class="settings">
        <header class="settings__header">
            <h1 class="settings__title">Impostazioni</h1>
            <p class="settings__subtitle">
                Gestione account, tenant e sicurezza del dispositivo.
            </p>
        </header>

        <Tabs value="account" class="settings__tabs">
            <TabList>
                <Tab value="account"><i class="pi pi-user" aria-hidden="true" />&nbsp;Account</Tab>
                <Tab value="tenant"><i class="pi pi-building" aria-hidden="true" />&nbsp;Tenant</Tab>
            </TabList>

            <TabPanels>
                <!-- ===================== ACCOUNT ===================== -->
                <TabPanel value="account">
                    <section class="settings__card" aria-labelledby="acc-h">
                        <h2 id="acc-h" class="settings__card-title">Sessione corrente</h2>
                        <dl class="settings__kv">
                            <dt>Email</dt>
                            <dd>{{ auth.session.email || '\u2014' }}</dd>

                            <dt>Server URL</dt>
                            <dd>
                                <code>{{ auth.session.server_url || '\u2014' }}</code>
                            </dd>

                            <dt>Device ID</dt>
                            <dd>
                                <code>{{ auth.session.device_id || '\u2014' }}</code>
                                <Button
                                    v-if="auth.session.device_id"
                                    text rounded size="small"
                                    icon="pi pi-copy"
                                    aria-label="Copia device ID"
                                    @click="copyText(auth.session.device_id, 'device ID')"
                                />
                            </dd>

                            <dt>User ID</dt>
                            <dd><code>{{ auth.session.user_id || '\u2014' }}</code></dd>

                            <dt>Tenant ID</dt>
                            <dd><code>{{ auth.session.tenant_id || '\u2014' }}</code></dd>
                        </dl>
                    </section>

                    <section class="settings__card" aria-labelledby="acc-actions-h">
                        <h2 id="acc-actions-h" class="settings__card-title">Azioni</h2>
                        <div class="settings__actions">
                            <Button
                                label="Logout"
                                icon="pi pi-sign-out"
                                severity="secondary"
                                outlined
                                :loading="loggingOut"
                                @click="doLogout"
                            />
                            <p class="settings__hint">
                                Mantiene il certificato di questo dispositivo: potrai rientrare con email + password,
                                senza nuovo pairing.
                            </p>
                        </div>
                    </section>

                    <section class="settings__card settings__card--danger" aria-labelledby="acc-danger-h">
                        <h2 id="acc-danger-h" class="settings__card-title">Zona pericolosa</h2>
                        <div class="settings__actions">
                            <Button
                                label="Rimuovi questo dispositivo"
                                icon="pi pi-trash"
                                severity="danger"
                                @click="confirmWipe"
                            />
                            <p class="settings__hint">
                                Cancella certificato, chiave privata e token. Richiede nuovo pairing
                                (con invite code) per rientrare.
                            </p>
                        </div>
                    </section>
                </TabPanel>

                <!-- ===================== TENANT ===================== -->
                <TabPanel value="tenant">
                    <Message v-if="tenantError" severity="error" :closable="false" class="settings__alert">
                        {{ tenantError }}
                    </Message>

                    <section class="settings__card" aria-labelledby="ten-h">
                        <h2 id="ten-h" class="settings__card-title">Tenant</h2>

                        <template v-if="tenantLoading && !tenant">
                            <Skeleton width="60%" height="1.25rem" class="settings__skl" />
                            <Skeleton width="40%" height="1rem" class="settings__skl" />
                            <Skeleton width="80%" height="1rem" class="settings__skl" />
                        </template>

                        <dl v-else-if="tenant" class="settings__kv">
                            <dt>Nome</dt>
                            <dd>{{ tenant.name }}</dd>

                            <dt>ID</dt>
                            <dd><code>{{ tenant.id }}</code></dd>

                            <dt>Creato il</dt>
                            <dd>{{ fmtDate(tenant.created_at) }}</dd>

                            <dt>Sei owner</dt>
                            <dd>
                                <span v-if="tenant.is_owner" class="settings__badge settings__badge--ok">
                                    <i class="pi pi-check" aria-hidden="true" />&nbsp;Si
                                </span>
                                <span v-else class="settings__badge">No</span>
                            </dd>

                            <template v-if="tenant.owner_email">
                                <dt>Owner email</dt>
                                <dd>{{ tenant.owner_email }}</dd>
                            </template>

                            <dt>CA fingerprint</dt>
                            <dd>
                                <code :title="tenant.ca_fingerprint">{{ fingerprintShort }}</code>
                                <Button
                                    text rounded size="small"
                                    icon="pi pi-copy"
                                    aria-label="Copia fingerprint CA"
                                    @click="copyText(tenant.ca_fingerprint, 'fingerprint CA')"
                                />
                            </dd>
                        </dl>
                    </section>

                    <section v-if="tenant" class="settings__card" aria-labelledby="ten-invite-h">
                        <h2 id="ten-invite-h" class="settings__card-title">Codice invito</h2>
                        <p class="settings__hint">
                            Serve, insieme alla password admin, per associare nuovi dispositivi
                            (PC o mobile) a questo tenant.
                        </p>

                        <div class="settings__invite">
                            <code class="settings__invite-code">{{ inviteDisplay }}</code>
                            <Button
                                text rounded
                                :icon="inviteVisible ? 'pi pi-eye-slash' : 'pi pi-eye'"
                                :aria-label="inviteVisible ? 'Nascondi codice' : 'Mostra codice'"
                                @click="inviteVisible = !inviteVisible"
                            />
                            <Button
                                text rounded icon="pi pi-copy"
                                aria-label="Copia codice invito"
                                @click="copyText(tenant.invite_code, 'codice invito')"
                            />
                        </div>

                        <div v-if="tenant.is_owner" class="settings__actions" style="margin-top: 1rem;">
                            <Button
                                label="Rigenera codice invito"
                                icon="pi pi-refresh"
                                severity="warn"
                                outlined
                                @click="openRotate"
                            />
                            <p class="settings__hint">
                                Il vecchio codice smettera di funzionare immediatamente.
                                Richiede la password amministratore del tenant.
                            </p>
                        </div>
                    </section>

                    <section v-if="tenant && tenant.is_owner" class="settings__card" aria-labelledby="ten-trust-h">
                        <h2 id="ten-trust-h" class="settings__card-title">Diagnostica mTLS</h2>
                        <p class="settings__hint">
                            Forza Caddy a ricaricare la trust pool. Da usare se dopo aver creato un tenant
                            o associato un nuovo dispositivo le chiamate falliscono con <code>EOF</code>
                            o errori TLS (significa che il reload automatico non e' andato a buon fine).
                        </p>
                        <div class="settings__actions" style="margin-top: 0.75rem;">
                            <Button
                                label="Forza reload trust su Caddy"
                                icon="pi pi-bolt"
                                severity="secondary"
                                outlined
                                @click="openReload"
                            />
                        </div>
                    </section>
                </TabPanel>
            </TabPanels>
        </Tabs>

        <!-- Dialog rigenerazione invite -->
        <Dialog
            v-model:visible="rotateOpen"
            modal
            header="Rigenera codice invito"
            :style="{ width: 'min(420px, 92vw)' }"
            :closable="!rotating"
        >
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <p style="margin: 0; font-size: 0.875rem;">
                    Inserisci la password amministratore del tenant per generare un nuovo
                    invite code. Il precedente sara revocato all'istante.
                </p>
                <label for="rotate-pwd" class="settings__label">Password admin</label>
                <Password
                    input-id="rotate-pwd"
                    v-model="rotatePassword"
                    :feedback="false"
                    toggle-mask
                    autocomplete="off"
                    :disabled="rotating"
                    :input-style="{ width: '100%' }"
                    :pt="{ root: { style: 'width: 100%' } }"
                    @keyup.enter="rotateInvite"
                />
                <Message v-if="rotateError" severity="error" :closable="false">
                    {{ rotateError }}
                </Message>
            </div>
            <template #footer>
                <Button
                    label="Annulla"
                    severity="secondary"
                    text
                    :disabled="rotating"
                    @click="rotateOpen = false"
                />
                <Button
                    label="Rigenera"
                    icon="pi pi-refresh"
                    severity="warn"
                    :loading="rotating"
                    @click="rotateInvite"
                />
            </template>
        </Dialog>

        <!-- Dialog reload trust -->
        <Dialog
            v-model:visible="reloadOpen"
            modal
            header="Forza reload trust su Caddy"
            :style="{ width: 'min(460px, 92vw)' }"
            :closable="!reloading"
        >
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <p style="margin: 0; font-size: 0.875rem;">
                    Caddy rigenera la trust pool dal database e ricarica la sua configurazione.
                    Nessun downtime per le connessioni in corso.
                </p>
                <label for="reload-boot" class="settings__label">URL bootstrap</label>
                <InputText
                    id="reload-boot"
                    v-model="reloadBootstrapUrl"
                    spellcheck="false"
                    placeholder="https://bookeeper.tail22adce.ts.net"
                    :disabled="reloading"
                />
                <span class="settings__hint">
                    Stesso host del Server URL se il bootstrap e' esposto pubblicamente,
                    altrimenti l'host tailnet/VPN.
                </span>
                <label for="reload-pwd" class="settings__label">Password admin</label>
                <Password
                    input-id="reload-pwd"
                    v-model="reloadPassword"
                    :feedback="false"
                    toggle-mask
                    autocomplete="off"
                    :disabled="reloading"
                    :input-style="{ width: '100%' }"
                    :pt="{ root: { style: 'width: 100%' } }"
                    @keyup.enter="doReloadTrust"
                />
                <Message v-if="reloadError" severity="error" :closable="false">
                    {{ reloadError }}
                </Message>
            </div>
            <template #footer>
                <Button
                    label="Annulla"
                    severity="secondary"
                    text
                    :disabled="reloading"
                    @click="reloadOpen = false"
                />
                <Button
                    label="Ricarica"
                    icon="pi pi-bolt"
                    :loading="reloading"
                    @click="doReloadTrust"
                />
            </template>
        </Dialog>
    </div>
</template>

<style scoped>
.settings {
    max-width: 880px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.settings__header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.settings__title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
}
.settings__subtitle {
    margin: 0;
    color: var(--p-text-muted-color);
    font-size: 0.9375rem;
}

.settings__tabs {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.settings__card {
    border: 1px solid var(--p-content-border-color);
    background: var(--p-content-background);
    border-radius: 0.75rem;
    padding: 1.25rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    margin-bottom: 1rem;
}
.settings__card--danger {
    border-color: var(--p-red-300, #fca5a5);
}

.settings__card-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
}

.settings__kv {
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 1.25rem;
    row-gap: 0.5rem;
    margin: 0;
    font-size: 0.875rem;
}
.settings__kv dt {
    color: var(--p-text-muted-color);
    font-weight: 500;
    align-self: center;
}
.settings__kv dd {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    word-break: break-all;
}
.settings__kv code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.8125rem;
    background: var(--p-surface-100, rgba(0, 0, 0, 0.04));
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
}

.settings__actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.settings__hint {
    margin: 0;
    color: var(--p-text-muted-color);
    font-size: 0.8125rem;
    line-height: 1.4;
}

.settings__invite {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
}
.settings__invite-code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 1rem;
    letter-spacing: 0.05em;
    user-select: all;
    background: var(--p-surface-100, rgba(0, 0, 0, 0.04));
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
}

.settings__badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    background: var(--p-surface-200, rgba(0, 0, 0, 0.06));
    color: var(--p-text-color);
}
.settings__badge--ok {
    background: var(--p-green-100, #dcfce7);
    color: var(--p-green-800, #166534);
}

.settings__skl + .settings__skl {
    margin-top: 0.5rem;
}

.settings__alert {
    margin-bottom: 1rem;
}

.settings__label {
    font-size: 0.8125rem;
    font-weight: 500;
}

:deep(.p-button:focus-visible) {
    outline: 2px solid var(--p-primary-color);
    outline-offset: 2px;
}
</style>
