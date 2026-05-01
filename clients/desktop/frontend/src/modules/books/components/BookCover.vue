<script setup lang="ts">
/**
 * BookCover — placeholder editoriale per la copertina di un libro.
 * Quando `path` non è disponibile, mostra il titolo stilizzato su un
 * gradiente derivato dall'iniziale (deterministico, no flicker).
 */
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  path?: string | null;
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
</script>

<template>
  <div
    class="cover"
    :class="`cover--${size ?? 'md'}`"
    :style="path ? undefined : { background: gradient }"
    role="img"
    :aria-label="`Copertina di ${title}`"
  >
    <img v-if="path" :src="path" :alt="`Copertina di ${title}`" />
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
