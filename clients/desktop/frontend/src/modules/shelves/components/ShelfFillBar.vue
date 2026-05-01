<script setup lang="ts">
/**
 * ShelfFillBar — header card: barra orizzontale 0–100% + label numerico.
 * Soglie semantiche: ok (verde), warn (ambra), danger (rosso).
 */
import { computed } from 'vue';
import type { ShelfFill } from '../composables/useShelfFill';

interface Props {
  fill: ShelfFill;
  /** Compatto = solo barra senza testo (es. card piccola). */
  compact?: boolean;
}
const props = withDefaults(defineProps<Props>(), { compact: false });

const pctText = computed(() => `${Math.round(props.fill.pct * 100)}%`);
const widthStyle = computed(() => ({
  width: `${Math.min(100, props.fill.pct * 100)}%`,
}));
</script>

<template>
  <div
    class="fill-bar"
    :class="`fill-bar--${fill.level}`"
    role="progressbar"
    :aria-valuenow="Math.round(fill.pct * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="`Riempimento: ${fill.filled} di ${fill.total} libri`"
  >
    <div class="fill-bar__track">
      <div class="fill-bar__indicator" :style="widthStyle" />
    </div>
    <div v-if="!compact" class="fill-bar__label">
      <span class="fill-bar__count">{{ fill.filled }}/{{ fill.total }}</span>
      <span class="fill-bar__pct">{{ pctText }}</span>
    </div>
  </div>
</template>

<style scoped>
.fill-bar {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
}
.fill-bar__track {
  height: 6px;
  background: var(--p-surface-200);
  border-radius: 999px;
  overflow: hidden;
}
.fill-bar__indicator {
  height: 100%;
  border-radius: 999px;
  transition: width 250ms cubic-bezier(0.2, 0.8, 0.2, 1), background 200ms ease;
  background: var(--p-primary-500);
}
.fill-bar--warn .fill-bar__indicator {
  background: var(--p-amber-500, #d97706);
}
.fill-bar--danger .fill-bar__indicator {
  background: var(--p-red-500, #dc2626);
}
.fill-bar__label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--p-surface-600);
  font-variant-numeric: tabular-nums;
}
.fill-bar__pct {
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .fill-bar__indicator {
    transition: none;
  }
}
</style>

<style>
html.dark .fill-bar__track {
  background: var(--p-surface-700);
}
html.dark .fill-bar__label {
  color: var(--p-surface-300);
}
</style>
