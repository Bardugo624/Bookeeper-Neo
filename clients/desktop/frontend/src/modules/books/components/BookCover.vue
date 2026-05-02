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
 * Nessun byte di copertina passa dal server: il fetch e' diretto verso
 * `googleapis.com/books/v1/volumes` e l'immagine e' persistita solo in
 * IndexedDB locale (vedi `lib/coverCache.ts`).
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { getCover } from '@/lib/coverCache';
import { useCoverPrefsStore } from '@/stores/coverPrefs';

const props = defineProps<{
  title: string;
  path?: string | null;
  /** ISBN-13 preferito; ISBN-10 in fallback. Usato per Google Books. */
  isbn?: string | null;
  size?: 'sm' | 'md' | 'lg';
}>();

const initial = computed(() => (props.title?.[0] || '?').toUpperCase());

// Hash deterministico → tonalità: stessa copertina → stesso colore.
const hue = computed(() => {
  let h = 0;
  for (let i = 0; i < props.title.length; i++) {
    h = (h * 31 + props.title.charCodeAt(i)) >>> 0;
  }
  return h % 360;
});

const gradient = computed(
  () => `linear-gradient(160deg,
    hsl(${hue.value}deg 32% 38%) 0%,
    hsl(${(hue.value + 24) % 360}deg 28% 22%) 100%)`,
);

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
    :class="`cover--${size ?? 'md'}`"
    :style="effectivePath ? undefined : { background: gradient }"
    role="img"
    :aria-label="`Copertina di ${title}`"
  >
    <img
      v-if="effectivePath"
      :src="effectivePath"
      :alt="`Copertina di ${title}`"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="loadFailed = true"
    />
    <span v-else class="cover__initial" aria-hidden="true">{{ initial }}</span>
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
  font-family: 'Lora', Georgia, serif;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
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
</style>
