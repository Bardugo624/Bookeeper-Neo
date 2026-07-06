<script setup lang="ts">
/**
 * ChartCard.vue — wrapper card per i grafici.
 *
 * Standardizza titolo + sottotitolo + slot grafico + stato vuoto, con la
 * stessa identità visiva delle StatCard (border, radius, hover sottile).
 */
import { useI18n } from 'vue-i18n';

interface Props {
  title: string;
  subtitle?: string;
  empty?: boolean;
  emptyText?: string;
  /** altezza minima area grafico, in px (default 240). */
  height?: number;
}
const props = withDefaults(defineProps<Props>(), {
  empty: false,
  emptyText: undefined,
  height: 240,
});
const { t } = useI18n();
</script>

<template>
  <section class="chart-card">
    <header class="chart-card__head">
      <h2 class="chart-card__title">{{ title }}</h2>
      <p v-if="subtitle" class="chart-card__subtitle">{{ subtitle }}</p>
    </header>
    <div
      class="chart-card__body"
      :style="{ minHeight: `${props.height}px` }"
    >
      <div v-if="empty" class="chart-card__empty" role="status">
        <i class="pi pi-chart-bar" aria-hidden="true" />
        <span>{{ emptyText ?? t('stats.view.noDataDefault') }}</span>
      </div>
      <slot v-else />
    </div>
  </section>
</template>

<style scoped>
.chart-card {
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: border-color 200ms cubic-bezier(.2,.8,.2,1);
}
.chart-card:hover { border-color: var(--p-primary-200); }

.chart-card__head { display: flex; flex-direction: column; gap: 4px; }
.chart-card__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0;
  letter-spacing: -0.01em;
}
.chart-card__subtitle {
  font-size: 12px;
  color: var(--p-text-muted-color);
  margin: 0;
}

.chart-card__body { position: relative; flex: 1; }
.chart-card__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--p-text-muted-color);
  font-size: 13px;
  height: 100%;
  min-height: inherit;
}
.chart-card__empty i { font-size: 28px; opacity: .4; }

@media (prefers-reduced-motion: reduce) {
  .chart-card { transition: none; }
}
</style>

<style>
html.dark .chart-card:hover { border-color: var(--p-primary-400); }
</style>
