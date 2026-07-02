<script setup lang="ts">
/**
 * StatCard.vue — voce numerica della dashboard, in registro editoriale:
 * etichetta con icona discreta in alto, valore grande in Lora sotto,
 * hint opzionale. Il numero conta da 0 al valore (count-up, ease-out)
 * al primo render; con reduced-motion appare direttamente.
 *
 * `tone` colora SOLO l'icona: il colore segnala il ruolo, non decora.
 */
import { computed } from 'vue';
import { useCountUp } from '../composables/useCountUp';

interface Props {
  icon: string;        // pi icon class (es. "pi pi-book")
  label: string;       // descrizione breve
  value: number | string;
  hint?: string;       // riga secondaria opzionale (es. "12 lingue")
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'info';
}
const props = withDefaults(defineProps<Props>(), { tone: 'default' });

const NUM_IT = new Intl.NumberFormat('it-IT');
const numericValue = computed(() =>
  typeof props.value === 'number' ? props.value : Number.NaN,
);
const animated = useCountUp(
  computed(() => (Number.isNaN(numericValue.value) ? 0 : numericValue.value)),
);
const display = computed(() =>
  Number.isNaN(numericValue.value)
    ? String(props.value)
    : NUM_IT.format(animated.value),
);
</script>

<template>
  <article class="stat-card" :class="`stat-card--${tone}`" :aria-label="`${label}: ${value}`">
    <div class="stat-card__label">
      <i :class="icon" class="stat-card__glyph" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
    <div class="stat-card__value">{{ display }}</div>
    <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
  </article>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  background: var(--bk-surface);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  transition:
    box-shadow var(--bk-dur) var(--bk-ease),
    border-color var(--bk-dur) var(--bk-ease);
}
.stat-card:hover {
  box-shadow: var(--bk-shadow-1);
  border-color: var(--bk-border-strong);
}

.stat-card__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--bk-text-muted);
}
.stat-card__glyph {
  font-size: 14px;
  color: var(--p-primary-500);
}

.stat-card__value {
  font-family: 'Lora', Georgia, serif;
  font-size: 32px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--bk-text-strong);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.stat-card__hint {
  font-size: 12px;
  color: var(--bk-text-faint);
}

/* tone: colora solo il glifo (ruolo, non decorazione) */
.stat-card--success .stat-card__glyph { color: var(--p-green-600); }
.stat-card--warn    .stat-card__glyph { color: var(--p-amber-600); }
.stat-card--danger  .stat-card__glyph { color: var(--p-red-600); }
.stat-card--info    .stat-card__glyph { color: var(--p-blue-600); }

html.dark .stat-card__glyph { color: var(--p-primary-300); }
html.dark .stat-card--success .stat-card__glyph { color: var(--p-green-400); }
html.dark .stat-card--warn    .stat-card__glyph { color: var(--p-amber-400); }
html.dark .stat-card--danger  .stat-card__glyph { color: var(--p-red-400); }
html.dark .stat-card--info    .stat-card__glyph { color: var(--p-blue-400); }
</style>
