<script setup lang="ts">
/**
 * BookCover — copertina del libro con cache locale (IndexedDB).
 *
 * Sorgente immagine, in priorita':
 *   1. `path` esplicito (se mai presente lato server)
 *   2. cache locale → fetch da Google Books → cache locale
 *      (saltata se l'utente disattiva l'opzione in Impostazioni)
 *   3. placeholder gradient + iniziale (deterministico, no flicker).
 *
 * UX:
 *   - badge angolare in basso-dx mostra lo stato del download
 *     (spinner, errore, non disponibile) cosi' l'utente vede subito
 *     se l'app sta lavorando per quel libro;
 *   - pulsante "ricarica" in alto-dx (visibile su hover o sempre se
 *     fallita) per forzare il re-download via `forceRefetch`.
 *
 * Nessun byte di copertina passa dal server: il fetch e' diretto verso
 * `googleapis.com/books/v1/volumes` e l'immagine e' persistita solo in
 * IndexedDB locale (vedi `lib/coverCache.ts`).
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { getCover, getCoverStatus, forceRefetch, markBad, type CoverStatus } from '@/lib/coverCache';
import { useCoverPrefsStore } from '@/stores/coverPrefs';

const props = defineProps<{
  title: string;
  path?: string | null;
  /** ISBN-13 preferito; ISBN-10 in fallback. Usato per Google Books. */
  isbn?: string | null;
  size?: 'sm' | 'md' | 'lg';
}>();

const initial = computed(() => (props.title?.[0] || '?').toUpperCase());

// Placeholder: tele-libro nei toni della palette (le stesse famiglie dei
// colori scaffale), non HSL casuali. Hash deterministico titolo → tono:
// stessa copertina → stesso colore, e la griglia resta armonica.
const CLOTH_TONES = [
  '#3e6252', // salvia profonda
  '#9c5a3c', // terracotta
  '#3a4a6b', // notte
  '#6b3a5f', // prugna
  '#7d5a2a', // ambra scura
  '#4a4a4a', // grafite
];
const clothTone = computed(() => {
  let h = 0;
  for (let i = 0; i < props.title.length; i++) {
    h = (h * 31 + props.title.charCodeAt(i)) >>> 0;
  }
  return CLOTH_TONES[h % CLOTH_TONES.length];
});

const prefs = useCoverPrefsStore();
const { enabled: coversEnabled } = storeToRefs(prefs);

// blob: URL risolto dalla cache; null finche' non disponibile.
const cachedUrl = ref<string | null>(null);
// true quando l'<img> fallisce a caricare l'URL (URL stale, rete, CSP):
// in quel caso ri-mostriamo il gradiente invece dell'icona "broken image".
const loadFailed = ref(false);
const effectivePath = computed(() => {
  if (loadFailed.value) return null;
  return props.path || cachedUrl.value;
});

// Stato reattivo dal cache (Vue tracking della Map reactive in coverCache).
const status = computed<CoverStatus>(() => {
  if (props.path) return 'cached';      // path server: niente download
  if (!props.isbn) return 'idle';
  if (!coversEnabled.value) return 'idle';
  return getCoverStatus(props.isbn);
});

// Mostra badge stato solo quando c'e' qualcosa da comunicare.
const showBadge = computed(() => {
  if (props.path) return false;          // copertina servita dal server
  if (!coversEnabled.value) return false; // utente ha disattivato il download
  if (!props.isbn) return false;
  return status.value === 'fetching' || status.value === 'failed' || status.value === 'not-found';
});

// Mostra pulsante ricarica: sempre se ISBN presente e download abilitato,
// MA solo su hover quando la copertina e' gia' caricata correttamente.
const canRetry = computed(() => {
  if (props.path) return false;
  if (!coversEnabled.value) return false;
  if (!props.isbn) return false;
  return status.value !== 'fetching';
});

const retrying = ref(false);
async function onRetry(ev: Event) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!props.isbn || retrying.value) return;
  retrying.value = true;
  loadFailed.value = false;
  cachedUrl.value = null;
  try {
    cachedUrl.value = await forceRefetch(props.isbn);
  } finally {
    retrying.value = false;
  }
}

async function onImgError() {
  loadFailed.value = true;
  // Se l'URL veniva dalla cache locale, il blob e' probabilmente
  // corrotto (es. garbage da v0.1.12). Cancelliamo il record IDB
  // cosi' la prossima richiesta forza un fresh fetch — ma solo se
  // l'errore non era su `path` esplicito server-side.
  if (!props.path && props.isbn) {
    await markBad(props.isbn);
  }
}

async function resolveCover() {
  // Reset per evitare di mostrare la copertina del libro precedente
  cachedUrl.value = null;
  loadFailed.value = false;
  if (props.path) return;
  if (!coversEnabled.value) return;
  const isbn = props.isbn;
  if (!isbn) return;
  cachedUrl.value = await getCover(isbn);
}

watch(
  () => [props.isbn, props.path, coversEnabled.value] as const,
  () => void resolveCover(),
  { immediate: true },
);
</script>

<template>
  <div
    class="cover"
    :class="[`cover--${size ?? 'md'}`, { 'cover--has-isbn': canRetry }]"
    :style="effectivePath ? undefined : { background: clothTone }"
    role="img"
    :aria-label="`Copertina di ${title}`"
  >
    <img
      v-if="effectivePath"
      :src="effectivePath"
      :alt="`Copertina di ${title}`"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="onImgError"
    />
    <span v-else class="cover__initial" aria-hidden="true">{{ initial }}</span>

    <!-- Badge stato (basso-destra). Solo quando c'e' qualcosa da dire. -->
    <span
      v-if="showBadge"
      class="cover__badge"
      :class="`cover__badge--${status}`"
      :title="
        status === 'fetching' ? 'Sto scaricando la copertina...'
        : status === 'failed'  ? 'Download fallito — clicca ricarica per riprovare'
        : 'Copertina non disponibile su Google Libri / OpenLibrary'
      "
      :aria-label="
        status === 'fetching' ? 'Download copertina in corso'
        : status === 'failed'  ? 'Download copertina fallito'
        : 'Copertina non trovata'
      "
    >
      <i v-if="status === 'fetching'" class="pi pi-spin pi-spinner" aria-hidden="true" />
      <i v-else-if="status === 'failed'" class="pi pi-exclamation-triangle" aria-hidden="true" />
      <i v-else class="pi pi-image" aria-hidden="true" />
    </span>

    <!-- Pulsante ricarica (alto-destra). Forza il re-download. -->
    <button
      v-if="canRetry && size !== 'sm'"
      type="button"
      class="cover__retry"
      :class="{ 'cover__retry--persistent': status === 'failed' || status === 'not-found' }"
      :disabled="retrying"
      :title="status === 'cached' || effectivePath ? 'Riscarica copertina' : 'Cerca copertina'"
      :aria-label="status === 'cached' || effectivePath ? 'Riscarica copertina' : 'Cerca copertina'"
      @click="onRetry"
    >
      <i :class="retrying ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  /* Il dorso (sinistra) è meno arrotondato del taglio: legge da libro. */
  border-radius: 2px 5px 5px 2px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
  font-family: 'Lora', Georgia, serif;
  box-shadow: var(--bk-shadow-book);
  flex-shrink: 0;
  transition: box-shadow var(--bk-dur) var(--bk-ease), transform var(--bk-dur) var(--bk-ease);
}
/* Piega del dorso + luce ambiente: si applica anche alle copertine vere.
 * Solo overlay (pointer-events none), nessun impatto sulle interazioni. */
.cover::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(
      90deg,
      rgb(0 0 0 / 0.22) 0,
      rgb(0 0 0 / 0.06) 3%,
      rgb(255 255 255 / 0.14) 6.5%,
      transparent 10%
    ),
    linear-gradient(165deg, rgb(255 255 255 / 0.08), transparent 45%, rgb(0 0 0 / 0.12));
  z-index: 1;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover__initial {
  font-weight: 600;
  letter-spacing: -0.02em;
}
.cover--sm {
  width: 40px;
  aspect-ratio: 2 / 3;
}
.cover--sm .cover__initial {
  font-size: 1.1rem;
}
.cover--md {
  width: 100px;
  aspect-ratio: 2 / 3;
}
.cover--md .cover__initial {
  font-size: 2.4rem;
}
.cover--lg {
  width: 180px;
  aspect-ratio: 2 / 3;
}
.cover--lg .cover__initial {
  font-size: 4.4rem;
}

/* ================== Badge stato ================== */
.cover__badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #fff;
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  pointer-events: none; /* il tooltip basta */
  z-index: 2;
}
.cover--sm .cover__badge {
  width: 14px;
  height: 14px;
  font-size: 0.55rem;
  bottom: 2px;
  right: 2px;
}
.cover__badge--fetching {
  background: rgba(77, 131, 105, 0.92); /* sage brand */
}
.cover__badge--failed {
  background: rgba(185, 47, 47, 0.92);
}
.cover__badge--not-found {
  background: rgba(80, 80, 80, 0.85);
}

/* ================== Pulsante ricarica ================== */
.cover__retry {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #fff;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
  z-index: 3;
}
.cover__retry:hover:not(:disabled) {
  background: rgba(48, 85, 69, 0.95); /* dark sage */
  transform: scale(1);
}
.cover__retry:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
  opacity: 1;
  transform: scale(1);
}
.cover__retry:disabled {
  cursor: wait;
  opacity: 0.7;
}
.cover:hover .cover__retry,
.cover__retry--persistent {
  opacity: 1;
  transform: scale(1);
}
@media (hover: none) {
  /* Touch: sempre visibile (no hover affordance) */
  .cover__retry {
    opacity: 0.85;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cover__retry { transition: none; }
}
</style>
