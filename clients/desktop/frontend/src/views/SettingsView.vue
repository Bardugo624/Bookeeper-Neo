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
import { useRoute, useRouter } from 'vue-router';
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
import ToggleSwitch from 'primevue/toggleswitch';
import SelectButton from 'primevue/selectbutton';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useI18n } from 'vue-i18n';
import { readLocaleMode, setLocaleMode, type LocaleMode } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { useCoverPrefsStore } from '@/stores/coverPrefs';
import { cacheStats, clearCovers } from '@/lib/coverCache';
import { tenantEndpoints, type TenantInfo } from '@/lib/api/endpoints/tenant';
import { keystore } from '@/lib/keystore';
import { useUpdater } from '@/composables/useUpdater';
import UpdateChangelogDialog from '@/layouts/UpdateChangelogDialog.vue';
import ImportExportPanel from '@/views/settings/ImportExportPanel.vue';
import BackupPanel from '@/views/settings/BackupPanel.vue';
import { GetAppInfo } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';

const auth = useAuthStore();
const coverPrefs = useCoverPrefsStore();
const router = useRouter();
const route = useRoute();
// Deep-link a un tab specifico (es. /settings?tab=data dall'onboarding).
const VALID_TABS = ['account', 'tenant', 'covers', 'data', 'info'];
const initialTab = VALID_TABS.includes(String(route.query.tab)) ? String(route.query.tab) : 'account';
const toast = useToast();
const confirm = useConfirm();
const { t, locale } = useI18n();

// ---------- Lingua ----------
// v-model diretto sulla modalità persistita: il set applica subito la
// lingua (vedi i18n/setLocaleMode), nessun riavvio.
const localeModeRef = ref<LocaleMode>(readLocaleMode());
const localeMode = computed<LocaleMode>({
    get: () => localeModeRef.value,
    set: (m) => {
        localeModeRef.value = m;
        setLocaleMode(m);
    },
});
const localeOptions = computed(() => [
    { label: t('settings.language.it'), value: 'it' as LocaleMode },
    { label: t('settings.language.en'), value: 'en' as LocaleMode },
    { label: t('settings.language.system'), value: 'system' as LocaleMode },
]);

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
        tenantError.value = e instanceof Error ? e.message : t('settings.tenant.tenantErrorFallback');
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
    return new Date(unix * 1000).toLocaleString(locale.value === 'en' ? 'en-US' : 'it-IT');
}

async function copyText(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.add({ severity: 'success', summary: t('settings.account.copiedOk'), detail: label, life: 2000 });
    } catch {
        toast.add({ severity: 'warn', summary: t('settings.account.copyFailed'), life: 2500 });
    }
}

// ---------- Rotate invite dialog ----------
const rotateOpen = ref(false);const rotatePassword = ref('');
const rotating = ref(false);
const rotateError = ref<string | null>(null);

async function openRotate() {
    rotatePassword.value = '';
    rotateError.value = null;
    rotateOpen.value = true;
    // Libreria locale: la admin password è generata e custodita dall'app,
    // l'utente non la conosce. Precompilala.
    if (auth.session.local) {
        try { rotatePassword.value = await keystore.localAdminPassword(); } catch { /* noop */ }
    }
}

async function rotateInvite() {
    rotateError.value = null;
    if (rotatePassword.value.length < 12) {
        rotateError.value = t('settings.tenant.adminPwdShort');
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
            summary: t('settings.tenant.inviteRegeneratedOk'),
            detail: t('settings.tenant.inviteRegeneratedDetail'),
            life: 4000,
        });
    } catch (e) {
        rotateError.value = e instanceof Error ? e.message : t('settings.tenant.regenerateFailed');
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
        reloadError.value = t('settings.tenant.reloadPwdShort');
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
            summary: t('settings.tenant.reloadOk'),
            detail: t('settings.tenant.reloadOkDetail'),
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
            summary: t('settings.account.logoutOk'),
            detail: t('settings.account.logoutOkDetail'),
            life: 3000,
        });
        router.push({ path: '/login', query: { loggedout: '1' } });
    } finally {
        loggingOut.value = false;
    }
}

function confirmWipe() {
    confirm.require({
        header: t('settings.account.wipeHeader'),
        message: t('settings.account.wipeMessage'),
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: t('settings.account.wipeAccept'),
        rejectLabel: t('common.cancel'),
        acceptProps: { severity: 'danger', icon: 'pi pi-trash' },
        rejectProps: { severity: 'secondary', outlined: true },
        accept: async () => {
            await auth.wipe();
            toast.add({
                severity: 'success',
                summary: t('settings.account.wipedOk'),
                life: 2500,
            });
            router.push('/login');
        },
    });
}

// ---------- Covers tab ----------
const coverStats = ref<{ count: number }>({ count: 0 });
const coverStatsLoading = ref(false);
const clearingCovers = ref(false);

async function loadCoverStats() {
    coverStatsLoading.value = true;
    try {
        coverStats.value = await cacheStats();
    } finally {
        coverStatsLoading.value = false;
    }
}

async function doClearCovers() {
    clearingCovers.value = true;
    try {
        await clearCovers();
        await loadCoverStats();
        toast.add({
            severity: 'success',
            summary: t('settings.covers.clearedOk'),
            life: 2500,
        });
    } finally {
        clearingCovers.value = false;
    }
}

onMounted(() => {
    loadTenant();
    loadCoverStats();
    loadAppInfo();
});

// ---------- Info tab ----------
const updater = useUpdater();
const appInfo = ref<main.AppInfo | null>(null);
const showChangelogFromInfo = ref(false);

async function loadAppInfo() {
    try {
        appInfo.value = await GetAppInfo();
    } catch {
        /* best effort */
    }
}

const formattedBuildDate = computed(() => {
    const d = appInfo.value?.build_date;
    if (!d) return t('settings.info.devBuild');
    try {
        return new Date(d).toLocaleString(locale.value === 'en' ? 'en-US' : 'it-IT', {
            dateStyle: 'medium', timeStyle: 'short',
        });
    } catch { return d; }
});

// "Ultimo controllo": legge il timestamp persistito da useUpdater.
const lastCheckText = computed(() => {
    if (updater.state.checking) return t('settings.info.lastCheckNow');
    const raw = localStorage.getItem('bookeeper:lastUpdateCheck');
    if (!raw) return t('settings.info.lastCheckNever');
    const ts = Number(raw);
    if (!isFinite(ts) || ts <= 0) return t('settings.info.lastCheckNever');
    const diffMin = (Date.now() - ts) / 60000;
    if (diffMin < 1) return t('settings.info.lastCheckSecondsAgo');
    if (diffMin < 60) return t('settings.info.lastCheckMinutesAgo', { n: Math.round(diffMin) });
    const diffH = diffMin / 60;
    if (diffH < 24) return t('settings.info.lastCheckHoursAgo', { n: Math.round(diffH) });
    return new Date(ts).toLocaleString(locale.value === 'en' ? 'en-US' : 'it-IT', {
        dateStyle: 'medium', timeStyle: 'short',
    });
});

async function checkUpdatesNow() {
    const info = await updater.checkNow(true);
    if (!info) {
        toast.add({
            severity: 'error',
            summary: t('settings.info.checkFailed'),
            detail: updater.state.error || t('settings.info.checkFailedDetail'),
            life: 4000,
        });
        return;
    }
    if (!info.available) {
        toast.add({
            severity: 'success',
            summary: t('settings.info.upToDate'),
            detail: t('settings.info.upToDateDetail', { v: info.current }),
            life: 3000,
        });
    }
}
</script>

<template>
    <div class="settings">
        <header class="settings__header">
            <h1 class="settings__title">{{ t('settings.header.title') }}</h1>
            <p class="settings__subtitle">
                {{ t('settings.header.subtitle') }}
            </p>
        </header>

        <Tabs :value="initialTab" class="settings__tabs">
            <TabList>
                <Tab value="account"><i class="pi pi-user" aria-hidden="true" />&nbsp;{{ t('settings.tabs.account') }}</Tab>
                <Tab value="tenant"><i class="pi pi-building" aria-hidden="true" />&nbsp;{{ t('settings.tabs.tenant') }}</Tab>
                <Tab value="covers"><i class="pi pi-image" aria-hidden="true" />&nbsp;{{ t('settings.tabs.covers') }}</Tab>
                <Tab value="data"><i class="pi pi-database" aria-hidden="true" />&nbsp;{{ t('settings.tabs.data') }}</Tab>
                <Tab value="info"><i class="pi pi-info-circle" aria-hidden="true" />&nbsp;{{ t('settings.tabs.info') }}</Tab>
            </TabList>

            <TabPanels>
                <!-- ===================== ACCOUNT ===================== -->
                <TabPanel value="account">
                    <section class="settings__card" aria-labelledby="acc-h">
                        <h2 id="acc-h" class="settings__card-title">{{ t('settings.account.sessionTitle') }}</h2>
                        <dl class="settings__kv">
                            <dt>{{ t('settings.account.email') }}</dt>
                            <dd>{{ auth.session.email || '\u2014' }}</dd>

                            <dt>{{ t('settings.account.serverUrl') }}</dt>
                            <dd>
                                <code>{{ auth.session.server_url || '\u2014' }}</code>
                            </dd>

                            <dt>{{ t('settings.account.deviceId') }}</dt>
                            <dd>
                                <code>{{ auth.session.device_id || '\u2014' }}</code>
                                <Button
                                    v-if="auth.session.device_id"
                                    text rounded size="small"
                                    icon="pi pi-copy"
                                    :aria-label="t('settings.account.copyDeviceIdAria')"
                                    @click="copyText(auth.session.device_id, t('settings.account.copyDeviceIdLabel'))"
                                />
                            </dd>

                            <dt>{{ t('settings.account.userId') }}</dt>
                            <dd><code>{{ auth.session.user_id || '\u2014' }}</code></dd>

                            <dt>{{ t('settings.account.tenantId') }}</dt>
                            <dd><code>{{ auth.session.tenant_id || '\u2014' }}</code></dd>
                        </dl>
                    </section>

                    <section class="settings__card" aria-labelledby="acc-lang-h">
                        <h2 id="acc-lang-h" class="settings__card-title">{{ t('settings.language.title') }}</h2>
                        <div class="settings__actions">
                            <SelectButton
                                v-model="localeMode"
                                :options="localeOptions"
                                option-label="label"
                                option-value="value"
                                :allow-empty="false"
                                aria-labelledby="acc-lang-h"
                            />
                            <p class="settings__hint">{{ t('settings.language.hint') }}</p>
                        </div>
                    </section>

                    <section class="settings__card" aria-labelledby="acc-actions-h">
                        <h2 id="acc-actions-h" class="settings__card-title">{{ t('settings.account.actionsTitle') }}</h2>
                        <div class="settings__actions">
                            <Button
                                :label="t('settings.account.logout')"
                                icon="pi pi-sign-out"
                                severity="secondary"
                                outlined
                                :loading="loggingOut"
                                @click="doLogout"
                            />
                            <p class="settings__hint">
                                {{ t('settings.account.logoutHint') }}
                            </p>
                        </div>
                    </section>

                    <section class="settings__card settings__card--danger" aria-labelledby="acc-danger-h">
                        <h2 id="acc-danger-h" class="settings__card-title">{{ t('settings.account.dangerTitle') }}</h2>
                        <div class="settings__actions">
                            <Button
                                :label="t('settings.account.removeDevice')"
                                icon="pi pi-trash"
                                severity="danger"
                                @click="confirmWipe"
                            />
                            <p class="settings__hint">
                                {{ t('settings.account.removeDeviceHint') }}
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
                        <h2 id="ten-h" class="settings__card-title">{{ t('settings.tenant.title') }}</h2>

                        <template v-if="tenantLoading && !tenant">
                            <Skeleton width="60%" height="1.25rem" class="settings__skl" />
                            <Skeleton width="40%" height="1rem" class="settings__skl" />
                            <Skeleton width="80%" height="1rem" class="settings__skl" />
                        </template>

                        <dl v-else-if="tenant" class="settings__kv">
                            <dt>{{ t('settings.tenant.name') }}</dt>
                            <dd>{{ tenant.name }}</dd>

                            <dt>{{ t('settings.tenant.id') }}</dt>
                            <dd><code>{{ tenant.id }}</code></dd>

                            <dt>{{ t('settings.tenant.createdAt') }}</dt>
                            <dd>{{ fmtDate(tenant.created_at) }}</dd>

                            <dt>{{ t('settings.tenant.isOwner') }}</dt>
                            <dd>
                                <span v-if="tenant.is_owner" class="settings__badge settings__badge--ok">
                                    <i class="pi pi-check" aria-hidden="true" />&nbsp;{{ t('settings.tenant.yes') }}
                                </span>
                                <span v-else class="settings__badge">{{ t('settings.tenant.no') }}</span>
                            </dd>

                            <template v-if="tenant.owner_email">
                                <dt>{{ t('settings.tenant.ownerEmail') }}</dt>
                                <dd>{{ tenant.owner_email }}</dd>
                            </template>

                            <dt>{{ t('settings.tenant.caFingerprint') }}</dt>
                            <dd>
                                <code :title="tenant.ca_fingerprint">{{ fingerprintShort }}</code>
                                <Button
                                    text rounded size="small"
                                    icon="pi pi-copy"
                                    :aria-label="t('settings.tenant.copyFingerprintAria')"
                                    @click="copyText(tenant.ca_fingerprint, t('settings.account.copyFingerprintLabel'))"
                                />
                            </dd>
                        </dl>
                    </section>

                    <section v-if="tenant" class="settings__card" aria-labelledby="ten-invite-h">
                        <h2 id="ten-invite-h" class="settings__card-title">{{ t('settings.tenant.inviteTitle') }}</h2>
                        <p class="settings__hint">
                            {{ t('settings.tenant.inviteHint') }}
                        </p>

                        <div class="settings__invite">
                            <code class="settings__invite-code">{{ inviteDisplay }}</code>
                            <Button
                                text rounded
                                :icon="inviteVisible ? 'pi pi-eye-slash' : 'pi pi-eye'"
                                :aria-label="inviteVisible ? t('settings.tenant.hideCode') : t('settings.tenant.showCode')"
                                @click="inviteVisible = !inviteVisible"
                            />
                            <Button
                                text rounded icon="pi pi-copy"
                                :aria-label="t('settings.tenant.copyInviteAria')"
                                @click="copyText(tenant.invite_code, t('settings.account.copyInviteLabel'))"
                            />
                        </div>

                        <div v-if="tenant.is_owner" class="settings__actions" style="margin-top: 1rem;">
                            <Button
                                :label="t('settings.tenant.regenerateInvite')"
                                icon="pi pi-refresh"
                                severity="warn"
                                outlined
                                @click="openRotate"
                            />
                            <p class="settings__hint">
                                {{ t('settings.tenant.regenerateInviteHint') }}
                            </p>
                        </div>
                    </section>

                    <!-- Solo deploy remoto: in modalità libreria locale non c'è
                         Caddy né trust pool (il server risponderebbe 503). -->
                    <section v-if="tenant && tenant.is_owner && !auth.session.local" class="settings__card" aria-labelledby="ten-trust-h">
                        <h2 id="ten-trust-h" class="settings__card-title">{{ t('settings.tenant.mtlsTitle') }}</h2>
                        <i18n-t keypath="settings.tenant.mtlsHint" tag="p" class="settings__hint">
                            <template #eof><code>EOF</code></template>
                        </i18n-t>
                        <div class="settings__actions" style="margin-top: 0.75rem;">
                            <Button
                                :label="t('settings.tenant.forceReload')"
                                icon="pi pi-bolt"
                                severity="secondary"
                                outlined
                                @click="openReload"
                            />
                        </div>
                    </section>
                </TabPanel>

                <!-- ===================== COVERS ===================== -->
                <TabPanel value="covers">
                    <section class="settings__card" aria-labelledby="cov-h">
                        <h2 id="cov-h" class="settings__card-title">{{ t('settings.covers.sourceTitle') }}</h2>
                        <p class="settings__hint">
                            {{ t('settings.covers.sourceHint') }}
                        </p>

                        <div class="settings__toggle-row">
                            <ToggleSwitch
                                v-model="coverPrefs.enabled"
                                input-id="cov-enabled"
                                aria-describedby="cov-enabled-hint"
                            />
                            <label for="cov-enabled" class="settings__toggle-label">
                                {{ t('settings.covers.autoDownload') }}
                            </label>
                        </div>
                        <p id="cov-enabled-hint" class="settings__hint" style="margin-top: 0.5rem;">
                            {{ t('settings.covers.autoDownloadHint') }}
                        </p>
                    </section>

                    <section class="settings__card" aria-labelledby="cov-cache-h">
                        <h2 id="cov-cache-h" class="settings__card-title">{{ t('settings.covers.cacheTitle') }}</h2>
                        <dl class="settings__kv">
                            <dt>{{ t('settings.covers.savedCovers') }}</dt>
                            <dd>
                                <template v-if="coverStatsLoading">
                                    <Skeleton width="3rem" height="1rem" />
                                </template>
                                <template v-else>{{ coverStats.count }}</template>
                            </dd>
                        </dl>
                        <div class="settings__actions" style="margin-top: 0.75rem;">
                            <Button
                                :label="t('settings.covers.refreshStats')"
                                icon="pi pi-refresh"
                                severity="secondary"
                                outlined
                                size="small"
                                :loading="coverStatsLoading"
                                @click="loadCoverStats"
                            />
                            <Button
                                :label="t('settings.covers.clearCache')"
                                icon="pi pi-trash"
                                severity="danger"
                                outlined
                                :loading="clearingCovers"
                                :disabled="coverStats.count === 0"
                                @click="doClearCovers"
                            />
                            <p class="settings__hint">
                                {{ t('settings.covers.clearCacheHint') }}
                            </p>
                        </div>
                    </section>
                </TabPanel>

                <!-- ===================== DATI (import/export) ===================== -->
                <TabPanel value="data">
                    <ImportExportPanel />
                    <BackupPanel />
                </TabPanel>

                <!-- ===================== INFO ===================== -->
                <TabPanel value="info">
                    <!-- Hero card: identita' app a colpo d'occhio -->
                    <section class="settings__card info-hero" aria-labelledby="info-h">
                        <div class="info-hero__icon" aria-hidden="true">
                            <i class="pi pi-book"></i>
                        </div>
                        <div class="info-hero__body">
                            <p class="info-hero__eyebrow">{{ t('settings.info.eyebrow') }}</p>
                            <h2 id="info-h" class="info-hero__version">
                                {{ t('settings.info.version', { v: appInfo?.version || '\u2014' }) }}
                            </h2>
                            <p class="info-hero__meta">
                                <span class="info-hero__chip">
                                    <i class="pi pi-tag" aria-hidden="true"></i>
                                    {{ appInfo?.channel || 'stable' }}
                                </span>
                                <span class="info-hero__dot" aria-hidden="true">·</span>
                                <span>{{ t('settings.info.buildLabel', { date: formattedBuildDate }) }}</span>
                            </p>
                        </div>
                    </section>

                    <!-- Stato aggiornamenti: brand, single primary action -->
                    <section class="settings__card" aria-labelledby="info-upd-h">
                        <h2 id="info-upd-h" class="settings__card-title">{{ t('settings.info.updatesTitle') }}</h2>

                        <Message v-if="updater.state.error" severity="error" :closable="false" class="settings__alert">
                            {{ updater.state.error }}
                        </Message>

                        <!-- Pannello stato sage on-brand -->
                        <div class="update-state" :class="{
                            'update-state--available': updater.state.available && !updater.state.ready,
                            'update-state--ready': updater.state.ready,
                            'update-state--ok': updater.state.info && !updater.state.available,
                        }">
                            <i class="pi update-state__icon" :class="{
                                'pi-sparkles': updater.state.available && !updater.state.ready,
                                'pi-check-circle': updater.state.ready || (updater.state.info && !updater.state.available),
                                'pi-clock': !updater.state.info,
                            }" aria-hidden="true"></i>
                            <div class="update-state__text">
                                <i18n-t v-if="updater.state.ready" keypath="settings.info.readyMsg" tag="span">
                                    <template #name><strong>Bookeeper {{ updater.state.info?.latest }}</strong></template>
                                </i18n-t>
                                <i18n-t v-else-if="updater.state.downloading" keypath="settings.info.downloadingMsg" tag="span">
                                    <template #name><strong>Bookeeper {{ updater.state.info?.latest }}</strong></template>
                                </i18n-t>
                                <i18n-t v-else-if="updater.state.available && updater.state.info" keypath="settings.info.availableMsg" tag="span">
                                    <template #name><strong>Bookeeper {{ updater.state.info.latest }}</strong></template>
                                </i18n-t>
                                <template v-else-if="updater.state.info">
                                    {{ t('settings.info.upToDateMsg') }}
                                </template>
                                <template v-else>
                                    {{ t('settings.info.idleMsg') }}
                                </template>
                                <span class="update-state__sub">
                                    {{ t('settings.info.lastCheck', { when: lastCheckText }) }}
                                </span>
                            </div>
                        </div>

                        <div class="settings__actions" style="margin-top: 0.875rem;">
                            <Button
                                :label="t('settings.info.checkNow')"
                                icon="pi pi-refresh"
                                severity="secondary"
                                outlined
                                :loading="updater.state.checking"
                                @click="checkUpdatesNow"
                            />
                            <Button
                                v-if="updater.state.available && updater.state.info"
                                :label="t('settings.info.seeChangelog')"
                                icon="pi pi-book"
                                severity="secondary"
                                text
                                @click="showChangelogFromInfo = true"
                            />
                            <Button
                                v-if="updater.state.available && !updater.state.downloading && !updater.state.ready"
                                :label="t('settings.info.download')"
                                icon="pi pi-download"
                                :loading="updater.state.downloading"
                                @click="updater.startDownload()"
                            />
                            <Button
                                v-if="updater.state.ready"
                                :label="t('settings.info.installRestart')"
                                icon="pi pi-refresh"
                                @click="updater.installNow()"
                            />
                        </div>
                    </section>

                    <UpdateChangelogDialog
                        v-model:visible="showChangelogFromInfo"
                        :info="updater.state.info"
                        @download="updater.startDownload(); showChangelogFromInfo = false"
                    />
                </TabPanel>
            </TabPanels>
        </Tabs>

        <!-- Dialog rigenerazione invite -->
        <Dialog
            v-model:visible="rotateOpen"
            modal
            :header="t('settings.dialogs.rotateHeader')"
            :style="{ width: 'min(420px, 92vw)' }"
            :closable="!rotating"
        >
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <p style="margin: 0; font-size: 0.875rem;">
                    {{ t('settings.dialogs.rotateIntro') }}
                </p>
                <label for="rotate-pwd" class="settings__label">{{ t('settings.dialogs.adminPwdLabel') }}</label>
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
                    :label="t('common.cancel')"
                    severity="secondary"
                    text
                    :disabled="rotating"
                    @click="rotateOpen = false"
                />
                <Button
                    :label="t('settings.dialogs.regenerate')"
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
            :header="t('settings.dialogs.reloadHeader')"
            :style="{ width: 'min(460px, 92vw)' }"
            :closable="!reloading"
        >
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <p style="margin: 0; font-size: 0.875rem;">
                    {{ t('settings.dialogs.reloadIntro') }}
                </p>
                <label for="reload-boot" class="settings__label">{{ t('settings.dialogs.bootstrapUrlLabel') }}</label>
                <InputText
                    id="reload-boot"
                    v-model="reloadBootstrapUrl"
                    spellcheck="false"
                    placeholder="https://bookeeper.tail22adce.ts.net"
                    :disabled="reloading"
                />
                <span class="settings__hint">
                    {{ t('settings.dialogs.bootstrapUrlHint') }}
                </span>
                <label for="reload-pwd" class="settings__label">{{ t('settings.dialogs.adminPwdLabel') }}</label>
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
                    :label="t('common.cancel')"
                    severity="secondary"
                    text
                    :disabled="reloading"
                    @click="reloadOpen = false"
                />
                <Button
                    :label="t('settings.dialogs.reload')"
                    icon="pi pi-bolt"
                    :loading="reloading"
                    @click="doReloadTrust"
                />
            </template>
        </Dialog>
    </div>
</template>

<style scoped>
/* ============================================================
 * Info tab \u2014 hero card + update state panel.
 * On-brand sage gradient + book icon.
 * ============================================================ */
.info-hero {
    display: flex;
    align-items: center;
    gap: 1.25rem;
}
.info-hero__icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--p-primary-500), var(--p-primary-700));
    color: var(--p-primary-50);
    flex-shrink: 0;
    box-shadow: 0 2px 8px color-mix(in oklab, var(--p-primary-700) 25%, transparent);
}
.info-hero__icon i { font-size: 1.75rem; }
.info-hero__body { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.info-hero__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--p-primary-700);
    font-weight: 600;
}
.info-hero__version {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--p-text-color);
    font-variant-numeric: tabular-nums;
}
.info-hero__meta {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.info-hero__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--p-primary-500) 12%, var(--p-surface-0));
    color: var(--p-primary-700);
    font-weight: 500;
    font-size: 0.78rem;
}
.info-hero__chip i { font-size: 0.7rem; }
.info-hero__dot { color: var(--p-surface-400); }

/* Pannello stato update sage */
.update-state {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-radius: 10px;
    background: color-mix(in oklab, var(--p-primary-500) 6%, var(--p-surface-0));
    border: 1px solid color-mix(in oklab, var(--p-primary-500) 18%, transparent);
    color: var(--p-text-color);
    line-height: 1.45;
    font-size: 0.9rem;
}
.update-state--available {
    background: color-mix(in oklab, var(--p-primary-500) 10%, var(--p-surface-0));
    border-color: color-mix(in oklab, var(--p-primary-500) 30%, transparent);
}
.update-state--ready {
    background: color-mix(in oklab, var(--p-primary-500) 14%, var(--p-surface-0));
    border-color: color-mix(in oklab, var(--p-primary-500) 40%, transparent);
}
.update-state__icon {
    font-size: 1.15rem;
    color: var(--p-primary-700);
    margin-top: 0.1rem;
    flex-shrink: 0;
}
.update-state__text { display: flex; flex-direction: column; gap: 0.2rem; }
.update-state__sub {
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
    font-variant-numeric: tabular-nums;
}

:global(.dark) .info-hero__eyebrow,
:global(.dark) .info-hero__chip { color: var(--p-primary-200); }
:global(.dark) .info-hero__chip {
    background: color-mix(in oklab, var(--p-primary-500) 20%, transparent);
}
:global(.dark) .update-state__icon { color: var(--p-primary-300); }

/*
 * Dark mode: --p-surface-0 resta bianco in PrimeVue, quindi il
 * color-mix produceva un pannello quasi bianco anche su tema scuro.
 * Forziamo un base scuro coerente con .settings__card (surface-800).
 */
:global(.dark) .update-state {
    background: color-mix(in oklab, var(--p-primary-500) 12%, var(--p-surface-800));
    border-color: color-mix(in oklab, var(--p-primary-500) 30%, transparent);
    color: var(--p-surface-100);
}
:global(.dark) .update-state--available {
    background: color-mix(in oklab, var(--p-primary-500) 18%, var(--p-surface-800));
    border-color: color-mix(in oklab, var(--p-primary-500) 45%, transparent);
}
:global(.dark) .update-state--ready {
    background: color-mix(in oklab, var(--p-primary-500) 24%, var(--p-surface-800));
    border-color: color-mix(in oklab, var(--p-primary-500) 55%, transparent);
}
:global(.dark) .update-state__sub { color: var(--p-surface-300); }

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
    /* Tint sage-green del primary: leggibile e on-brand sia in light
       che in dark (evita il bianco-su-bianco quando --p-surface-100 in
       dark mode resta vicino al bianco). */
    background: color-mix(in srgb, var(--p-primary-500) 14%, transparent);
    color: var(--p-primary-700);
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
    background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
    color: var(--p-primary-700);
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
    background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
    color: var(--p-primary-700);
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

.settings__toggle-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.settings__toggle-label {
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
}

:deep(.p-button:focus-visible) {
    outline: 2px solid var(--p-primary-color);
    outline-offset: 2px;
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark) .x`
     in scoped CSS Vue: spostiamo le regole dark in un blocco non-scoped. -->
<style>
html.dark .settings__kv code {
    background: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
    color: var(--p-primary-200);
}
html.dark .settings__invite-code {
    background: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
    color: var(--p-primary-200);
}
html.dark .settings__badge {
    background: color-mix(in srgb, var(--p-primary-500) 22%, transparent);
    color: var(--p-primary-200);
}
html.dark .settings__badge--ok {
    background: color-mix(in srgb, #22c55e 22%, transparent);
    color: #bbf7d0;
}
</style>
