<script setup lang="ts">
/**
 * StatCard.vue — KPI card per la dashboard.
 *
 * Pattern: icon-pill colorata + numero grande in tabular-nums + label
 * descrittiva. Variante `tone` mappa il colore del pill al ruolo semantico
 * (default/success/warn/danger/info) usando i token PrimeVue.
 */
import { computed } from 'vue';

interface Props {
  icon: string;        // pi icon class (es. "pi pi-book")
  label: string;       // descrizione breve
  value: number | string;
  hint?: string;       // riga secondaria opzionale (es. "12 lingue")
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'info';
}
const props = withDefaults(defineProps<Props>(), { tone: 'default' });

const NUM_IT = new Intl.NumberFormat('it-IT');
const display = computed(() =>
  typeof props.value === 'number' ? NUM_IT.format(props.value) : props.value,
);
</script>

<template>
  <article class="stat-card" :class="`stat-card--${tone}`" :aria-label="`${label}: ${display}`">
    <div class="stat-card__icon">
      <i :class="icon" aria-hidden="true" />
    </div>
    <div class="stat-card__body">
      <div class="stat-card__value">{{ display }}</div>
      <div class="stat-card__label">{{ label }}</div>
      <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
    </div>
  </article>
</template>

<style scoped>
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  transition: transform 200ms cubic-bezier(.2,.8,.2,1),
              box-shadow 200ms cubic-bezier(.2,.8,.2,1),
              border-color 200ms cubic-bezier(.2,.8,.2,1);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .06);
  border-color: var(--p-primary-200);
}
@media (prefers-reduced-motion: reduce) {
  .stat-card { transition: none; }
  .stat-card:hover { transform: none; }
}

.stat-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 22px;
  flex-shrink: 0;
  background: var(--p-primary-50);
  color: var(--p-primary-600);
}

.stat-card__body { min-width: 0; flex: 1; }
.stat-card__value {
  font-family: 'Lora', Georgia, serif;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--p-text-color);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.stat-card__label {
  font-size: 13px;
  color: var(--p-text-muted-color);
  margin-top: 4px;
  font-weight: 500;
}
.stat-card__hint {
  font-size: 11px;
  color: var(--p-text-muted-color);
  opacity: .75;
  margin-top: 2px;
}

/* tone variants */
.stat-card--success .stat-card__icon { background: color-mix(in srgb, var(--p-green-500) 12%, transparent); color: var(--p-green-600); }
.stat-card--warn    .stat-card__icon { background: color-mix(in srgb, var(--p-amber-500) 14%, transparent); color: var(--p-amber-600); }
.stat-card--danger  .stat-card__icon { background: color-mix(in srgb, var(--p-red-500) 12%, transparent); color: var(--p-red-600); }
.stat-card--info    .stat-card__icon { background: color-mix(in srgb, var(--p-blue-500) 12%, transparent); color: var(--p-blue-600); }
</style>

<style>
/* Dark mode: card surface + icon tint adjustments. */
html.dark .stat-card { background: var(--p-content-background); }
html.dark .stat-card:hover { box-shadow: 0 6px 18px rgba(0, 0, 0, .35); border-color: var(--p-primary-400); }
html.dark .stat-card__icon { background: color-mix(in srgb, var(--p-primary-500) 18%, transparent); color: var(--p-primary-300); }
html.dark .stat-card--success .stat-card__icon { background: color-mix(in srgb, var(--p-green-500) 22%, transparent); color: var(--p-green-300); }
html.dark .stat-card--warn    .stat-card__icon { background: color-mix(in srgb, var(--p-amber-500) 22%, transparent); color: var(--p-amber-300); }
html.dark .stat-card--danger  .stat-card__icon { background: color-mix(in srgb, var(--p-red-500) 22%, transparent); color: var(--p-red-300); }
html.dark .stat-card--info    .stat-card__icon { background: color-mix(in srgb, var(--p-blue-500) 22%, transparent); color: var(--p-blue-300); }
</style>
