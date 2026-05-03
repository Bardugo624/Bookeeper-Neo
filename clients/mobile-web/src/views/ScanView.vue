<script setup lang="ts">
/**
 * Phase D — ISBN scanner.
 *
 * Strategy:
 *   1. Camera stream via getUserMedia({ video: { facingMode: 'environment' }}).
 *      iOS Safari ≥14 and Chrome Android both honour this on https origins.
 *   2. Decoding pipeline (in order of preference):
 *        a. Native `BarcodeDetector` API (Chrome ≥83 Android, Safari ≥17).
 *           Cheapest path — ~3ms per frame, no JS lib weight.
 *        b. `@zxing/browser` fallback (~250 KB gzipped) for everything else.
 *   3. On detected EAN-13: validate the ISBN check digit, vibrate, query
 *      our catalog. If known → show a "found" sheet with the book card.
 *      If unknown → fetch Open Library metadata and offer "Aggiungi".
 *   4. Stream and decoder are stopped on unmount and on dialog open to
 *      conserve battery / avoid double-scans of the same code.
 *   5. Manual fallback: an InputText accepts a typed ISBN-13 when camera
 *      access is denied or no decoder is available.
 *
 * Why no auto-confirm POST: the user always sees the metadata before a
 * book is created. The MVP scope explicitly puts edit on the desktop, so
 * the mobile add path is intentionally simple (title + authors + ISBN +
 * publisher + year, no shelves / wishlist routing).
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { api, ApiError } from '@/lib/api';

interface Book {
    id: string;
    title: string;
    subtitle?: string | null;
    authors?: string[] | null;
    isbn_13?: string | null;
    publisher?: string | null;
    published_year?: number | null;
}

interface OLData {
    title?: string;
    subtitle?: string;
    authors?: { name: string }[];
    publishers?: { name: string }[];
    publish_date?: string;
    cover?: { medium?: string; large?: string };
    number_of_pages?: number;
    // Estensioni dal lookup unificato server-side: questi campi
    // arrivano dall'endpoint /lookup/metadata/{isbn} e vengono
    // forwardati al POST /books per parita' col desktop.
    language?: string;
    description?: string;
    genre?: string;
    format?: string;
    cover_candidates?: string[];
}

// Shape della risposta /api/v1/m/lookup/metadata/{isbn} — vedi
// server/internal/lookup/lookup.go. JSON camelCase.
interface MetadataResp {
    title: string;
    subtitle: string;
    authors: string[];
    publisher: string;
    publishYear: number;
    pageCount: number;
    language: string;
    description: string;
    genre: string;
    format: string;
    isbn10: string;
    isbn13: string;
    coverUrl: string;
    coverCandidates: string[];
    sourceUrl: string;
    sources: string[];
}

interface ScanResult {
    isbn: string;
    found: Book | null;
    fallback: OLData | null;
}

const videoRef = ref<HTMLVideoElement | null>(null);
const cameraError = ref<string | null>(null);
const decoderReady = ref(false);
const manualIsbn = ref('');
const manualError = ref<string | null>(null);
const manualLoading = ref(false);
const result = ref<ScanResult | null>(null);
const lookupLoading = ref(false);
const lookupIsbnInProgress = ref<string | null>(null);
const addLoading = ref(false);
const toast = ref<string | null>(null);
const torchSupported = ref(false);
const torchOn = ref(false);
let toastTimer: number | undefined;

function showToast(msg: string, ms = 4000): void {
    toast.value = msg;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.value = null; }, ms);
}

let stream: MediaStream | null = null;
let nativeDetector: BarcodeDetectorLike | null = null;
let zxingReader: ZXingReader | null = null;
let zxingControls: { stop: () => void } | null = null;
let rafId: number | undefined;
let stopped = false;

// Minimal local types so we don't pull a `dom-chromium` package.
interface BarcodeDetectorLike {
    detect(source: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
}
interface BarcodeDetectorCtor {
    new (opts: { formats: string[] }): BarcodeDetectorLike;
    getSupportedFormats?: () => Promise<string[]>;
}
interface ZXingReader {
    decodeFromVideoDevice(
        deviceId: string | undefined,
        videoElement: HTMLVideoElement,
        cb: (res: { getText(): string } | undefined) => void,
    ): Promise<{ stop: () => void }>;
    reset(): void;
}

async function startCamera(): Promise<void> {
    cameraError.value = null;
    try {
        // Higher resolution → smaller barcodes still resolve to enough
        // pixels for EAN-13 decoding. 480p (the device default for many
        // Android phones) often produces only ~80px-tall bars at typical
        // book-holding distance, which is below the reliable threshold.
        // We also ask for continuous autofocus so the lens keeps the
        // barcode sharp as the user moves the phone.
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                // @ts-expect-error — non-standard but honoured by Chrome Android
                focusMode: 'continuous',
            },
            audio: false,
        });
        if (videoRef.value) {
            videoRef.value.srcObject = stream;
            await videoRef.value.play().catch(() => {/* user gesture required on iOS — autoplay attr handles it */});
        }
        // Best-effort: enable continuous autofocus + a small zoom on
        // devices that expose the constraint via applyConstraints.
        try {
            const track = stream.getVideoTracks()[0];
            const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
                focusMode?: string[];
                zoom?: { min: number; max: number; step: number };
                torch?: boolean;
            };
            const advanced: MediaTrackConstraintSet[] = [];
            if (caps.focusMode?.includes('continuous')) {
                // @ts-expect-error — non-standard
                advanced.push({ focusMode: 'continuous' });
            }
            if (caps.zoom && caps.zoom.max >= 1.5) {
                // Slight zoom helps the camera focus close enough on the
                // barcode without forcing the user into macro distance.
                // @ts-expect-error — non-standard
                advanced.push({ zoom: Math.min(2, caps.zoom.max) });
            }
            if (advanced.length > 0) {
                await track.applyConstraints({ advanced });
            }
            // Detect torch capability (Chrome Android exposes it; iOS Safari
            // does not). Used to render the flashlight button in the UI.
            torchSupported.value = caps.torch === true;
        } catch {
            // Constraint not supported on this device — ignore.
        }
        await startDecoder();
    } catch (err) {
        cameraError.value =
            err instanceof Error && err.name === 'NotAllowedError'
                ? "Permesso fotocamera negato. Inserisci l'ISBN manualmente."
                : "Impossibile accedere alla fotocamera. Inserisci l'ISBN manualmente.";
    }
}

async function startDecoder(): Promise<void> {
    const Ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Ctor) {
        try {
            const supported = (await Ctor.getSupportedFormats?.()) ?? [];
            // EAN-13 is the only format actually used for ISBNs, but some
            // older / supplementary barcodes are ean_8 or upc_a; including
            // them increases chances of a hit when the camera grabs only
            // the smaller addon code first.
            const wanted = ['ean_13', 'ean_8', 'upc_a'].filter(
                (f) => supported.length === 0 || supported.includes(f),
            );
            if (wanted.includes('ean_13')) {
                nativeDetector = new Ctor({ formats: wanted });
                decoderReady.value = true;
                scanLoop();
                return;
            }
        } catch {
            // fall through to ZXing
        }
    }
    // Lazy-load ZXing only when the native API is unavailable to keep the
    // initial bundle small for users on modern devices.
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    zxingReader = new BrowserMultiFormatReader() as unknown as ZXingReader;
    if (!videoRef.value) return;
    zxingControls = await zxingReader.decodeFromVideoDevice(
        undefined,
        videoRef.value,
        (res) => {
            if (res) handleDetection(res.getText());
        },
    );
    decoderReady.value = true;
}

async function scanLoop(): Promise<void> {
    if (stopped || !nativeDetector || !videoRef.value) return;
    if (videoRef.value.readyState >= 2) {
        try {
            const codes = await nativeDetector.detect(videoRef.value);
            if (codes.length > 0) {
                handleDetection(codes[0].rawValue);
                return; // pause until handler reschedules
            }
        } catch {
            // transient errors during page hide / track ended; just keep polling
        }
    }
    rafId = window.requestAnimationFrame(scanLoop);
}

function stopAll(): void {
    stopped = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = undefined;
    if (zxingControls) {
        try { zxingControls.stop(); } catch { /* ignore */ }
        zxingControls = null;
    }
    if (zxingReader) {
        try { zxingReader.reset(); } catch { /* ignore */ }
        zxingReader = null;
    }
    if (stream) {
        for (const t of stream.getTracks()) t.stop();
        stream = null;
    }
    nativeDetector = null;
    decoderReady.value = false;
}

function resumeScanning(): void {
    stopped = false;
    if (nativeDetector) scanLoop();
    // ZXing keeps its own loop running; nothing to resume there if the
    // controls are still active.
}

function handleDetection(raw: string): void {
    const isbn = normaliseIsbn(raw);
    if (!isbn) {
        // Unknown / invalid code — keep scanning.
        if (nativeDetector) rafId = window.requestAnimationFrame(scanLoop);
        return;
    }
    // Short pulse to confirm "barcode acquired" — distinct from the longer
    // success haptic fired when the lookup resolves.
    if (navigator.vibrate) navigator.vibrate(40);
    void lookupIsbn(isbn);
}

async function toggleTorch(): Promise<void> {
    if (!stream || !torchSupported.value) return;
    const track = stream.getVideoTracks()[0];
    const next = !torchOn.value;
    try {
        // @ts-expect-error — non-standard but supported on Chrome Android
        await track.applyConstraints({ advanced: [{ torch: next }] });
        torchOn.value = next;
    } catch {
        // Some devices report support but reject the constraint mid-stream;
        // surface a discreet toast so the user understands.
        showToast('Torcia non disponibile su questo dispositivo', 2500);
        torchSupported.value = false;
    }
}

function normaliseIsbn(raw: string): string | null {
    const digits = raw.replace(/[^0-9Xx]/g, '');
    if (digits.length === 13 && /^\d{13}$/.test(digits) && validEan13(digits)) return digits;
    if (digits.length === 10 && validIsbn10(digits)) return digits;
    return null;
}

function validEan13(s: string): boolean {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += (i % 2 === 0 ? 1 : 3) * Number(s[i]);
    }
    return (10 - (sum % 10)) % 10 === Number(s[12]);
}

function validIsbn10(s: string): boolean {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += (10 - i) * Number(s[i]);
    const last = s[9].toUpperCase();
    sum += last === 'X' ? 10 : Number(last);
    return sum % 11 === 0;
}

async function lookupIsbn(isbn: string): Promise<void> {
    lookupLoading.value = true;
    lookupIsbnInProgress.value = isbn;
    try {
        // 1) Local catalog — exact match in title+isbn FTS.
        const data = await api.get<{ books: Book[] }>(
            `/books?q=${encodeURIComponent(isbn)}&limit=5`,
        );
        const local = (data.books ?? []).find(
            (b) => b.isbn_13 === isbn || (b as { isbn_10?: string }).isbn_10 === isbn,
        );
        if (local) {
            result.value = { isbn, found: local, fallback: null };
            return;
        }
        // 2) Lookup unificato server-side. Un solo round-trip: il
        //    server orchestra GoogleBooks → AnnasArchive → OpenLibrary
        //    con cache 30g e ci ritorna il merge. Stessa fonte usata
        //    da desktop, garantendo parita' totale di shape.
        const ol = await fetchUnifiedMetadata(isbn);
        result.value = { isbn, found: null, fallback: ol };
    } catch (err) {
        showToast(err instanceof ApiError ? err.body : 'errore di rete');
        // Resume scanning since we're not opening a dialog.
        if (!result.value) resumeScanning();
    } finally {
        lookupLoading.value = false;
        lookupIsbnInProgress.value = null;
        // Distinct success pattern (short-pause-short) so the user can
        // distinguish "detected" from "book ready to confirm".
        if (result.value && navigator.vibrate) navigator.vibrate([60, 50, 60]);
    }
}

// Single source of truth: chiama l'endpoint server unificato e mappa
// la risposta sullo shape OLData esteso usato dal resto della view.
// 404 → null. Errori transienti → null silenzioso (best-effort:
// l'utente puo' sempre aggiungere il bare ISBN).
async function fetchUnifiedMetadata(isbn: string): Promise<OLData | null> {
    try {
        const r = await api.get<MetadataResp>(
            `/lookup/metadata/${encodeURIComponent(isbn)}`,
        );
        if (!r || (!r.title && !r.coverUrl && (!r.coverCandidates || r.coverCandidates.length === 0))) {
            return null;
        }
        return {
            title: r.title,
            subtitle: r.subtitle,
            authors: (r.authors ?? []).map((name) => ({ name })),
            publishers: r.publisher ? [{ name: r.publisher }] : undefined,
            publish_date: r.publishYear ? String(r.publishYear) : undefined,
            number_of_pages: r.pageCount,
            cover: r.coverUrl ? { large: r.coverUrl } : undefined,
            language: r.language,
            description: r.description,
            genre: r.genre,
            format: r.format,
            cover_candidates: r.coverCandidates ?? [],
        };
    } catch {
        // 404 dal server o transiente: l'utente vedra' il branch
        // "nessun metadato" e potra' usare addBareIsbn.
        return null;
    }
}

// Best-effort cover URL for the result dialog. Prefers the OL/Google
// thumbnail when available, otherwise falls back to the OL covers CDN.
function coverUrl(): string | null {
    if (!result.value) return null;
    const fb = result.value.fallback;
    if (fb?.cover?.large) return fb.cover.large;
    if (fb?.cover?.medium) return fb.cover.medium;
    if (fb?.cover_candidates && fb.cover_candidates.length > 0) return fb.cover_candidates[0];
    return `https://covers.openlibrary.org/b/isbn/${result.value.isbn}-M.jpg`;
}

function closeDialog(): void {
    result.value = null;
    resumeScanning();
}

// Add the bare ISBN to the catalog when no metadata can be found anywhere.
// Title falls back to the ISBN itself; user can fix it from desktop.
async function addBareIsbn(): Promise<void> {
    if (!result.value) return;
    addLoading.value = true;
    try {
        await api.post('/books', {
            title: `ISBN ${result.value.isbn}`,
            isbn_13: result.value.isbn.length === 13 ? result.value.isbn : '',
            isbn_10: result.value.isbn.length === 10 ? result.value.isbn : '',
            authors: [],
            publisher: '',
            published_year: 0,
            page_count: 0,
        });
        showToast('Libro aggiunto — completa i metadati dal desktop', 2400);
        result.value = null;
        window.setTimeout(() => { resumeScanning(); }, 1400);
    } catch (err) {
        showToast(err instanceof ApiError ? err.body : 'errore aggiunta');
    } finally {
        addLoading.value = false;
    }
}

async function addFromOpenLibrary(): Promise<void> {
    if (!result.value || !result.value.fallback) return;
    const ol = result.value.fallback;
    const year = ol.publish_date ? Number((ol.publish_date.match(/\d{4}/) ?? [])[0]) : 0;
    addLoading.value = true;
    try {
        // Parita' col desktop: includiamo TUTTI i campi che il
        // server accetta nel createBookReq (genre, language,
        // description, format, subtitle), in modo che un libro
        // aggiunto da mobile sia indistinguibile da uno aggiunto
        // dal form desktop dopo lookup.
        await api.post('/books', {
            title: ol.title ?? 'Senza titolo',
            subtitle: ol.subtitle ?? '',
            isbn_13: result.value.isbn.length === 13 ? result.value.isbn : '',
            isbn_10: result.value.isbn.length === 10 ? result.value.isbn : '',
            authors: (ol.authors ?? []).map((a) => a.name),
            publisher: ol.publishers?.[0]?.name ?? '',
            published_year: year || 0,
            page_count: ol.number_of_pages ?? 0,
            language: ol.language ?? '',
            description: ol.description ?? '',
            genre: ol.genre ?? '',
            format: ol.format ?? '',
        });
        showToast('Libro aggiunto al catalogo', 2000);
        result.value = null;
        // Brief pause before resuming so the toast is readable.
        window.setTimeout(() => { resumeScanning(); }, 1400);
    } catch (err) {
        showToast(err instanceof ApiError ? err.body : 'errore aggiunta');
    } finally {
        addLoading.value = false;
    }
}

async function submitManual(): Promise<void> {
    manualError.value = null;
    const isbn = normaliseIsbn(manualIsbn.value);
    if (!isbn) {
        manualError.value = 'ISBN non valido (deve essere 10 o 13 cifre).';
        return;
    }
    manualLoading.value = true;
    try {
        await lookupIsbn(isbn);
        manualIsbn.value = '';
    } finally {
        manualLoading.value = false;
    }
}

async function retryCamera(): Promise<void> {
    stopAll();
    stopped = false;
    await startCamera();
}

const dialogTitle = computed(() => {
    if (!result.value) return '';
    if (result.value.found) return 'Già nel catalogo';
    if (result.value.fallback) return 'Trovato online';
    return 'Sconosciuto';
});

onMounted(() => {
    void startCamera();
});

onUnmounted(() => {
    if (toastTimer) window.clearTimeout(toastTimer);
    stopAll();
});
</script>

<template>
    <section class="tab tab--scan" aria-labelledby="tab-scan-title">
        <header class="tab__header">
            <h1 id="tab-scan-title" class="tab__title">Scan ISBN</h1>
            <p class="tab__sub">Inquadra il codice a barre sul retro del libro</p>
        </header>

        <div class="viewport">
            <video
                ref="videoRef"
                class="viewport__video"
                playsinline
                muted
                autoplay
            />
            <div class="viewport__frame" aria-hidden="true">
                <div class="viewport__corner viewport__corner--tl" />
                <div class="viewport__corner viewport__corner--tr" />
                <div class="viewport__corner viewport__corner--bl" />
                <div class="viewport__corner viewport__corner--br" />
                <!-- Animated scan-line is the only decoder-armed signal:
                     it stops while a lookup is in flight so the user knows
                     the camera isn't going to fire another detection. -->
                <div
                    v-if="decoderReady && !lookupLoading"
                    class="viewport__scanline"
                />
            </div>

            <button
                v-if="torchSupported"
                type="button"
                class="viewport__torch"
                :class="{ 'viewport__torch--on': torchOn }"
                :aria-pressed="torchOn"
                aria-label="Torcia"
                @click="toggleTorch"
            >
                <i :class="torchOn ? 'pi pi-bolt' : 'pi pi-bolt'" aria-hidden="true" />
            </button>

            <p v-if="!cameraError && !decoderReady" class="viewport__status" role="status" aria-live="polite">
                Avvio fotocamera…
            </p>
            <p v-else-if="lookupLoading" class="viewport__status viewport__status--lookup" role="status" aria-live="polite">
                <i class="pi pi-spin pi-spinner" aria-hidden="true" />
                <span>Cerco ISBN&nbsp;{{ lookupIsbnInProgress }}</span>
            </p>
        </div>

        <div class="footer">
            <Message
                v-if="cameraError"
                severity="warn"
                :closable="false"
                class="footer__msg"
                role="alert"
            >
                <div class="footer__msg-row">
                    <span>{{ cameraError }}</span>
                    <Button
                        label="Riprova"
                        icon="pi pi-refresh"
                        size="small"
                        text
                        @click="retryCamera"
                    />
                </div>
            </Message>
            <Message
                v-if="toast"
                severity="info"
                :closable="false"
                class="footer__msg"
                role="status"
                aria-live="polite"
            >
                {{ toast }}
            </Message>

            <form class="manual" @submit.prevent="submitManual">
                <label class="manual__label" for="manual-isbn">
                    Inserimento manuale
                </label>
                <div class="manual__row">
                    <InputText
                        id="manual-isbn"
                        v-model="manualIsbn"
                        class="manual__input"
                        placeholder="ISBN (10 o 13 cifre)"
                        inputmode="numeric"
                        autocomplete="off"
                        :aria-invalid="manualError ? 'true' : 'false'"
                        aria-describedby="manual-isbn-error"
                    />
                    <Button
                        type="submit"
                        icon="pi pi-arrow-right"
                        severity="secondary"
                        :disabled="!manualIsbn || manualLoading"
                        :loading="manualLoading"
                        aria-label="Cerca ISBN"
                    />
                </div>
                <Message
                    v-if="manualError"
                    id="manual-isbn-error"
                    severity="error"
                    :closable="false"
                    class="manual__error-msg"
                    role="alert"
                >
                    {{ manualError }}
                </Message>
            </form>
        </div>

        <Dialog
            :visible="result !== null"
            modal
            :header="dialogTitle"
            :style="{ width: 'min(420px, 92vw)' }"
            :closable="true"
            position="bottom"
            @update:visible="closeDialog"
        >
            <div v-if="result?.found" class="lookup">
                <div class="lookup__head">
                    <img
                        v-if="coverUrl()"
                        :src="coverUrl()!"
                        alt=""
                        class="lookup__cover"
                        loading="lazy"
                        @error="($event.target as HTMLImageElement).style.display='none'"
                    >
                    <div class="lookup__head-text">
                        <p class="lookup__title">{{ result.found.title }}</p>
                        <p v-if="result.found.subtitle" class="lookup__sub">
                            {{ result.found.subtitle }}
                        </p>
                        <p class="lookup__authors">
                            {{ (result.found.authors ?? []).join(', ') || '—' }}
                        </p>
                        <p class="lookup__meta">
                            <span v-if="result.found.publisher">{{ result.found.publisher }}</span>
                            <span v-if="result.found.publisher && result.found.published_year"> · </span>
                            <span v-if="result.found.published_year">{{ result.found.published_year }}</span>
                        </p>
                    </div>
                </div>
                <p class="lookup__hint lookup__hint--success">
                    <i class="pi pi-check-circle" aria-hidden="true" />
                    Questo libro è già nel tuo catalogo.
                </p>
            </div>

            <div v-else-if="result?.fallback" class="lookup">
                <div class="lookup__head">
                    <img
                        v-if="coverUrl()"
                        :src="coverUrl()!"
                        alt=""
                        class="lookup__cover"
                        loading="lazy"
                        @error="($event.target as HTMLImageElement).style.display='none'"
                    >
                    <div class="lookup__head-text">
                        <p class="lookup__title">{{ result.fallback.title || 'Senza titolo' }}</p>
                        <p v-if="result.fallback.subtitle" class="lookup__sub">
                            {{ result.fallback.subtitle }}
                        </p>
                        <p class="lookup__authors">
                            {{ (result.fallback.authors ?? []).map((a) => a.name).join(', ') || '—' }}
                        </p>
                        <p class="lookup__meta">
                            <span v-if="result.fallback.publishers?.[0]">
                                {{ result.fallback.publishers[0].name }}
                            </span>
                            <span v-if="result.fallback.publishers?.[0] && result.fallback.publish_date"> · </span>
                            <span v-if="result.fallback.publish_date">{{ result.fallback.publish_date }}</span>
                        </p>
                    </div>
                </div>
                <p class="lookup__hint">
                    Metadati indicativi — potrai correggerli dal desktop.
                </p>
            </div>

            <div v-else class="lookup">
                <p class="lookup__title">ISBN {{ result?.isbn }}</p>
                <p class="lookup__hint">
                    Nessun risultato online. Puoi aggiungerlo lo stesso e
                    completare titolo/autore dal desktop.
                </p>
            </div>

            <template #footer>
                <!-- Primary action depends on result state. We never show two
                     equal-weight buttons: the secondary "Chiudi" stays text
                     so the primary CTA is unambiguous. -->
                <Button label="Chiudi" text @click="closeDialog" />
                <Button
                    v-if="result?.found"
                    label="Scansiona un altro"
                    icon="pi pi-camera"
                    @click="closeDialog"
                />
                <Button
                    v-else-if="result?.fallback"
                    label="Aggiungi al catalogo"
                    icon="pi pi-plus"
                    :loading="addLoading"
                    @click="addFromOpenLibrary"
                />
                <Button
                    v-else
                    label="Aggiungi solo ISBN"
                    icon="pi pi-plus"
                    :loading="addLoading"
                    @click="addBareIsbn"
                />
            </template>
        </Dialog>
    </section>
</template>

<style scoped>
@import './_tab.css';

.tab--scan {
    display: flex;
    flex-direction: column;
}

.viewport {
    position: relative;
    flex: 1;
    min-height: 200px;
    background: #000;
    margin: 0.5rem 1rem;
    border-radius: 16px;
    overflow: hidden;
}

.viewport__video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
}

.viewport__frame {
    position: absolute;
    inset: 14% 12%;
    pointer-events: none;
}

.viewport__corner {
    position: absolute;
    width: 22px;
    height: 22px;
    /* Pure white for maximum contrast against arbitrary camera footage; the
       primary palette can be too low-contrast over a dark/noisy frame. */
    border: 3px solid #fff;
    border-radius: 4px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.viewport__corner--tl { top: 0; left: 0; border-right: none; border-bottom: none; }
.viewport__corner--tr { top: 0; right: 0; border-left: none; border-bottom: none; }
.viewport__corner--bl { bottom: 0; left: 0; border-right: none; border-top: none; }
.viewport__corner--br { bottom: 0; right: 0; border-left: none; border-top: none; }

.viewport__status {
    position: absolute;
    bottom: 0.625rem;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 0.375rem 0.75rem;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    border-radius: 999px;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    max-width: calc(100% - 2rem);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.viewport__status--lookup { background: rgba(33, 99, 232, 0.9); }

/* Scan line: a soft horizontal beam that sweeps across the framing
   reticle to signal that the decoder is actively looking for codes.
   Disabled while a lookup is in progress so the UI doesn't suggest the
   camera is about to fire another detection. */
.viewport__scanline {
    position: absolute;
    left: 6%;
    right: 6%;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(56, 189, 248, 0.95) 50%,
        transparent 100%
    );
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
    animation: scan 2s ease-in-out infinite;
    pointer-events: none;
}
@keyframes scan {
    0%   { top: 8%;  opacity: 0; }
    15%  {           opacity: 1; }
    85%  {           opacity: 1; }
    100% { top: 92%; opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
    .viewport__scanline { animation: none; top: 50%; opacity: 0.5; }
}

/* Torch button: floating top-right, large enough for thumb reach. */
.viewport__torch {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    font-size: 1.05rem;
    cursor: pointer;
    transition: background 150ms ease, transform 100ms ease;
    -webkit-tap-highlight-color: transparent;
}
.viewport__torch:active { transform: scale(0.94); }
.viewport__torch--on {
    background: #facc15;
    color: #1f2937;
    border-color: #facc15;
    box-shadow: 0 0 16px rgba(250, 204, 21, 0.55);
}

.footer {
    padding: 0 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.footer__msg {
    margin: 0;
}

.manual__label {
    display: block;
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.375rem;
}

.manual__row {
    display: flex;
    gap: 0.5rem;
}

.manual__input {
    flex: 1;
    min-height: 44px;
}

.manual__error {
    margin: 0.375rem 0 0;
    color: var(--p-red-600, #c0392b);
    font-size: 0.8rem;
}

.manual__error-msg {
    margin-top: 0.5rem;
}

.footer__msg-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
}

.lookup__head {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    margin-bottom: 0.875rem;
}
.lookup__cover {
    width: 72px;
    height: 108px;
    object-fit: cover;
    border-radius: 6px;
    background: var(--p-content-background, #f1f5f9);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    flex-shrink: 0;
}
.lookup__head-text { flex: 1; min-width: 0; }
.lookup__hint--success {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--p-green-600, #16a34a);
    font-weight: 500;
}

.lookup__title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.lookup__sub {
    margin: 0.125rem 0 0;
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
}

.lookup__authors {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
    color: var(--p-text-color);
}

.lookup__meta {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--p-text-muted-color);
}

.lookup__hint {
    margin: 0.875rem 0 0;
    padding: 0.5rem 0.625rem;
    background: var(--p-surface-100);
    border-radius: 8px;
    color: var(--p-text-muted-color);
    font-size: 0.82rem;
    line-height: 1.45;
}
</style>
