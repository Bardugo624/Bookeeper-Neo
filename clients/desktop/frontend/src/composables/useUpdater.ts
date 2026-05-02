/**
 * useUpdater — composable per gestire ciclo update lato frontend.
 *
 * Espone state reattivo + 3 azioni (check/download/install) su singleton
 * globale: tutti i componenti che lo usano vedono lo stesso stato senza
 * propagare props o store globali (l'updater è 100% client-side, non
 * deve finire in Pinia con tutto il resto).
 *
 * Eventi Wails ascoltati:
 *   - update:available  → emit dal backend Go in startup() o CheckForUpdate
 *   - update:progress   → durante DownloadUpdate ({ downloaded, total })
 *   - update:downloaded → quando il .exe è in %TEMP% verificato
 *   - update:error      → fallimento download / hash mismatch
 *
 * Cache localStorage: dopo un check fallito o "no update" non ricontrolliamo
 * per `CHECK_TTL_MS`. Override sempre via checkNow(true).
 */
import { onScopeDispose, reactive, readonly } from 'vue';
import { EventsOff, EventsOn } from '../../wailsjs/runtime/runtime';
import {
    CheckForUpdate,
    DownloadUpdate,
    GetAppInfo,
    InstallUpdate,
} from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';

const CHECK_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LAST_CHECK_KEY = 'bookeeper:lastUpdateCheck';
const DISMISSED_KEY = 'bookeeper:dismissedUpdateVersion';

interface UpdaterState {
    /** Versione installata (popolata al primo check). */
    current: string;
    /** Ultimo manifest scaricato; null finché non si è fatto un check. */
    info: main.UpdateInfo | null;
    /** true se la versione del manifest > current ed è non-dismissa. */
    available: boolean;
    /** Stati del download. */
    checking: boolean;
    downloading: boolean;
    /** Bytes per il progress bar. */
    progress: { downloaded: number; total: number };
    /** Installer pronto in %TEMP%, in attesa del click "Installa ora". */
    ready: boolean;
    /** Ultimo errore (string). */
    error: string | null;
}

const state = reactive<UpdaterState>({
    current: '',
    info: null,
    available: false,
    checking: false,
    downloading: false,
    progress: { downloaded: 0, total: 0 },
    ready: false,
    error: null,
});

let listenersWired = false;

function wireListeners() {
    if (listenersWired) return;
    listenersWired = true;

    EventsOn('update:available', (info: main.UpdateInfo) => {
        applyInfo(info);
    });
    EventsOn('update:progress', (p: { downloaded: number; total: number }) => {
        state.progress.downloaded = p.downloaded;
        state.progress.total = p.total;
    });
    EventsOn('update:downloaded', () => {
        state.downloading = false;
        state.ready = true;
        state.error = null;
    });
    EventsOn('update:error', (msg: string) => {
        state.downloading = false;
        state.ready = false;
        state.error = msg;
    });
}

function applyInfo(info: main.UpdateInfo) {
    state.info = info;
    state.current = info.current;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    state.available = info.available && info.latest !== dismissed;
}

async function ensureCurrent() {
    if (state.current) return;
    try {
        const app = await GetAppInfo();
        state.current = app.version;
    } catch {
        /* best effort */
    }
}

/**
 * Esegue un check del manifest. `force=false` rispetta il TTL 24h
 * (silenzioso a startup), `force=true` bypassa il throttle (bottone
 * "Controlla ora" nelle impostazioni).
 */
async function checkNow(force = false): Promise<main.UpdateInfo | null> {
    await ensureCurrent();
    if (!force) {
        const last = Number(localStorage.getItem(LAST_CHECK_KEY) || '0');
        if (Date.now() - last < CHECK_TTL_MS) return state.info;
    }
    state.checking = true;
    state.error = null;
    try {
        const info = await CheckForUpdate();
        applyInfo(info);
        localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
        return info;
    } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
        return null;
    } finally {
        state.checking = false;
    }
}

async function startDownload(): Promise<void> {
    if (state.downloading || state.ready) return;
    state.downloading = true;
    state.error = null;
    state.progress = { downloaded: 0, total: 0 };
    try {
        await DownloadUpdate();
        // Lo stato `ready` viene settato dall'evento update:downloaded.
    } catch (e) {
        state.downloading = false;
        state.error = e instanceof Error ? e.message : String(e);
    }
}

async function installNow(): Promise<void> {
    if (!state.ready) return;
    try {
        await InstallUpdate();
        // Il backend chiama os.Exit dopo aver lanciato l'installer:
        // questa Promise non risolverà mai. Lasciato così di proposito.
    } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
    }
}

/**
 * Nasconde il banner per la versione corrente (rimane in localStorage).
 * L'utente può sempre ri-controllare dalle impostazioni.
 */
function dismiss(): void {
    if (state.info) {
        localStorage.setItem(DISMISSED_KEY, state.info.latest);
    }
    state.available = false;
}

export function useUpdater() {
    wireListeners();

    // Cleanup degli handler globali se la app viene smontata (caso raro
    // in Wails, ma corretto). EventsOff è no-op se non c'erano listener.
    onScopeDispose(() => {
        // Mantengo i listener vivi: sono globali e desideriamo continuare
        // a ricevere update:* anche quando i singoli componenti unmounta.
        // Se in futuro servisse pulire, decommentare:
        // EventsOff('update:available');
        // EventsOff('update:progress');
        // EventsOff('update:downloaded');
        // EventsOff('update:error');
    });

    return {
        state: readonly(state),
        checkNow,
        startDownload,
        installNow,
        dismiss,
    };
}

// Marker per evitare che il bundler tree-shaki EventsOff (importato per
// futuro uso ma non chiamato attualmente).
void EventsOff;
