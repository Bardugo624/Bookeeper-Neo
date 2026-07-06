<script setup lang="ts">
/**
 * StatsView.vue — Dashboard analitica della libreria.
 *
 * Layout: header con refresh → grid KPI (6 card) → grid chart 2-col
 * (line additions, doughnut format, hbar lingue, hbar top autori, bar
 * decadi, dual-line prestiti) → tabella riempimento scaffali.
 *
 * Design rules applicate (ui-ux-pro-max chart subset):
 *   • legend sempre visibile o etichette inline
 *   • tooltip on-hover con valori formattati IT
 *   • assi con tabular-nums
 *   • colori token PrimeVue (light/dark reattivi via watcher su document.documentElement)
 *   • per >5 categorie horizontal bar (mai pie); doughnut riservato al format (≤4)
 *   • aria-label per screen reader su ciascun chart
 *   • prefers-reduced-motion → animazioni disattivate
 *   • empty state per ogni chart, skeleton per il primo load
 */
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import Chart from 'primevue/chart';
import Message from 'primevue/message';
import StatCard from '../components/StatCard.vue';
import ChartCard from '../components/ChartCard.vue';
import { useStatsStore } from '../store';
import {
  fmtMonthLabel,
  fmtNum,
  fmtPct,
} from '../types';

const store = useStatsStore();
const { t, te, locale } = useI18n();

/** Traduce una chiave format/lingua nota; fallback alla chiave grezza. */
function trFormat(key: string): string {
  const k = key.toLowerCase();
  return te(`stats.formatLabel.${k}`) ? t(`stats.formatLabel.${k}`) : key;
}
function trLang(key: string): string {
  const k = key.toLowerCase();
  return te(`stats.langLabel.${k}`) ? t(`stats.langLabel.${k}`) : key;
}

/* ---------- Chart theme: risolve i token CSS PrimeVue ---------- */

interface ChartTheme {
  text: string;
  textMuted: string;
  grid: string;
  primary: string;
  primarySoft: string;
  series: string[]; // palette qualitativa per categorie
}

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function buildTheme(): ChartTheme {
  return {
    text: readVar('--p-text-color', '#1f1f1f'),
    textMuted: readVar('--p-text-muted-color', '#6b6b6b'),
    grid: readVar('--p-content-border-color', 'rgba(0,0,0,.08)'),
    primary: readVar('--p-primary-500', '#7a8b6b'),
    primarySoft: readVar('--p-primary-200', '#c2cdb4'),
    series: [
      readVar('--p-primary-500', '#7a8b6b'),
      readVar('--p-amber-500', '#f59e0b'),
      readVar('--p-blue-500', '#3b82f6'),
      readVar('--p-purple-500', '#a855f7'),
      readVar('--p-pink-500', '#ec4899'),
      readVar('--p-teal-500', '#14b8a6'),
      readVar('--p-orange-500', '#f97316'),
      readVar('--p-cyan-500', '#06b6d4'),
    ],
  };
}

const theme = ref<ChartTheme>({
  text: '#1f1f1f', textMuted: '#6b6b6b', grid: 'rgba(0,0,0,.08)',
  primary: '#7a8b6b', primarySoft: '#c2cdb4',
  series: ['#7a8b6b', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'],
});

let darkObserver: MutationObserver | null = null;
function refreshTheme(): void {
  // nextTick assicura che le CSS vars siano applicate (es. dopo toggle dark mode)
  nextTick(() => { theme.value = buildTheme(); });
}

const reduced = ref(false);
function checkReducedMotion(): void {
  reduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- Chart options condivise ---------- */

const baseOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: reduced.value ? false : { duration: 400 },
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
      labels: { color: theme.value.textMuted, font: { size: 11 }, boxWidth: 10, boxHeight: 10, padding: 12 },
    },
    tooltip: {
      backgroundColor: 'rgba(0,0,0,.85)',
      padding: 10,
      cornerRadius: 6,
      titleFont: { size: 12 },
      bodyFont: { size: 12 },
      callbacks: {
        label: (ctx: any) => {
          // `ctx.raw` è il dato originale (numero) sia per vertical/horizontal
          // bar che per doughnut/line — `ctx.parsed.y` invece restituisce
          // l'indice di categoria sui bar orizzontali (indexAxis: 'y'), che
          // è la causa del bug "tooltip mostra il rank, non il count".
          const v = typeof ctx.raw === 'number'
            ? ctx.raw
            : (typeof ctx.parsed === 'object' ? (ctx.parsed.x ?? ctx.parsed.y) : ctx.parsed);
          return ` ${ctx.dataset.label ?? ctx.label}: ${fmtNum(v)}`;
        },
      },
    },
  },
}));

function axisOpts(showGrid = true) {
  return {
    ticks: { color: theme.value.textMuted, font: { size: 11 } },
    grid: { color: showGrid ? theme.value.grid : 'transparent', drawBorder: false },
    border: { display: false },
  };
}

/* ---------- Chart data builders (ricomputati su data o theme change) ---------- */

const additionsData = computed(() => {
  const rows = store.data?.additions_by_month ?? [];
  return {
    labels: rows.map((r) => fmtMonthLabel(r.ym)),
    datasets: [{
      label: t('stats.view.seriesAdded'),
      data: rows.map((r) => r.count),
      borderColor: theme.value.primary,
      backgroundColor: theme.value.primary + '33',
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    }],
  };
});
const additionsOpts = computed(() => ({
  ...baseOptions.value,
  plugins: { ...baseOptions.value.plugins, legend: { display: false } },
  scales: { x: axisOpts(false), y: { ...axisOpts(true), beginAtZero: true, ticks: { ...axisOpts(true).ticks, precision: 0 } } },
}));

const formatData = computed(() => {
  const rows = store.data?.by_format ?? [];
  return {
    labels: rows.map((r) => trFormat(r.key)),
    datasets: [{
      data: rows.map((r) => r.count),
      backgroundColor: rows.map((_, i) => theme.value.series[i % theme.value.series.length]),
      borderColor: 'var(--p-content-background)',
      borderWidth: 2,
    }],
  };
});
const formatOpts = computed(() => ({
  ...baseOptions.value,
  cutout: '60%',
  plugins: { ...baseOptions.value.plugins, legend: { ...baseOptions.value.plugins.legend, position: 'right' as const } },
}));

const languageData = computed(() => {
  const rows = store.data?.by_language ?? [];
  return {
    labels: rows.map((r) => trLang(r.key)),
    datasets: [{
      label: t('stats.view.seriesBooks'),
      data: rows.map((r) => r.count),
      backgroundColor: theme.value.primary + 'cc',
      borderRadius: 4,
      maxBarThickness: 22,
    }],
  };
});
const languageOpts = computed(() => ({
  ...baseOptions.value,
  indexAxis: 'y' as const,
  plugins: { ...baseOptions.value.plugins, legend: { display: false } },
  scales: { x: { ...axisOpts(true), beginAtZero: true, ticks: { ...axisOpts(true).ticks, precision: 0 } }, y: axisOpts(false) },
}));

const genreData = computed(() => {
  const rows = store.data?.by_genre ?? [];
  // Palette qualitativa: ogni genere ottiene un colore distinto dalla series
  // così la legenda visiva rinforza la lettura della classifica.
  return {
    labels: rows.map((r) => r.key),
    datasets: [{
      label: t('stats.view.seriesBooks'),
      data: rows.map((r) => r.count),
      backgroundColor: rows.map((_, i) => theme.value.series[i % theme.value.series.length] + 'cc'),
      borderRadius: 4,
      maxBarThickness: 22,
    }],
  };
});
const genreOpts = computed(() => ({
  ...baseOptions.value,
  indexAxis: 'y' as const,
  plugins: { ...baseOptions.value.plugins, legend: { display: false } },
  scales: { x: { ...axisOpts(true), beginAtZero: true, ticks: { ...axisOpts(true).ticks, precision: 0 } }, y: axisOpts(false) },
}));

const decadeData = computed(() => {
  const rows = store.data?.by_decade ?? [];
  return {
    labels: rows.map((r) => r.key),
    datasets: [{
      label: t('stats.view.seriesBooks'),
      data: rows.map((r) => r.count),
      backgroundColor: theme.value.series[2] + 'cc',
      borderRadius: 4,
      maxBarThickness: 28,
    }],
  };
});
const decadeOpts = computed(() => ({
  ...baseOptions.value,
  plugins: { ...baseOptions.value.plugins, legend: { display: false } },
  scales: { x: axisOpts(false), y: { ...axisOpts(true), beginAtZero: true, ticks: { ...axisOpts(true).ticks, precision: 0 } } },
}));

const loansData = computed(() => {
  const rows = store.data?.loans_by_month ?? [];
  return {
    labels: rows.map((r) => fmtMonthLabel(r.ym)),
    datasets: [
      {
        label: t('stats.view.seriesLent'),
        data: rows.map((r) => r.lent),
        borderColor: theme.value.series[1],
        backgroundColor: theme.value.series[1] + '22',
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
      },
      {
        label: t('stats.view.seriesReturned'),
        data: rows.map((r) => r.returned),
        borderColor: theme.value.series[5],
        backgroundColor: theme.value.series[5] + '22',
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
      },
    ],
  };
});
const loansOpts = computed(() => ({
  ...baseOptions.value,
  scales: { x: axisOpts(false), y: { ...axisOpts(true), beginAtZero: true, ticks: { ...axisOpts(true).ticks, precision: 0 } } },
}));

/* ---------- Top authors (lista, non chart) ---------- */
const topAuthors = computed(() => store.data?.top_authors ?? []);
const maxAuthorCount = computed(() => topAuthors.value[0]?.count ?? 1);

/* ---------- Shelf fill ---------- */
const shelfFill = computed(() => store.data?.shelf_fill ?? []);
function shelfPctColor(pct: number): string {
  if (pct >= 0.95) return 'var(--p-red-500)';
  if (pct >= 0.8) return 'var(--p-amber-500)';
  return 'var(--p-primary-500)';
}

/* ---------- Lifecycle ---------- */

onMounted(() => {
  checkReducedMotion();
  refreshTheme();
  // Reagisce ai toggle di dark mode (class="dark" su <html>)
  darkObserver = new MutationObserver(refreshTheme);
  darkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  store.fetch();
});

onBeforeUnmount(() => {
  darkObserver?.disconnect();
  darkObserver = null;
});

watch(() => store.data, refreshTheme);

const ov = computed(() => store.data?.overview ?? null);
const isInitialLoad = computed(() => store.loading && !store.data);
const lastFetchedLabel = computed(() => {
  if (!store.lastFetched) return '';
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'it-IT', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(store.lastFetched));
});
</script>

<template>
  <div class="stats-view">
    <!-- Header -->
    <header class="stats-view__header">
      <div>
        <h1 class="stats-view__title">{{ t('stats.view.title') }}</h1>
        <p class="stats-view__subtitle">
          {{ t('stats.view.subtitle') }}
        </p>
      </div>
      <div class="stats-view__actions">
        <span v-if="lastFetchedLabel" class="stats-view__last">
          {{ t('stats.view.updatedAt', { time: lastFetchedLabel }) }}
        </span>
        <Button
          icon="pi pi-refresh"
          :label="t('stats.view.refresh')"
          severity="secondary"
          outlined
          :loading="store.loading"
          @click="store.refresh()"
        />
      </div>
    </header>

    <Message v-if="store.error" severity="error" :closable="false" class="stats-view__error">
      {{ store.error }}
    </Message>

    <!-- KPI grid -->
    <section class="stats-view__kpis" :aria-label="t('stats.view.kpiAria')">
      <template v-if="isInitialLoad">
        <Skeleton v-for="i in 6" :key="i" height="92px" border-radius="12px" />
      </template>
      <template v-else-if="ov">
        <StatCard icon="pi pi-book"        :label="t('stats.view.kpiBooks')" :value="ov.total_books" />
        <StatCard icon="pi pi-user-edit"   :label="t('stats.view.kpiAuthors')" :value="ov.total_authors" tone="info" />
        <StatCard icon="pi pi-th-large"    :label="t('stats.view.kpiShelves')" :value="ov.total_shelves" />
        <StatCard icon="pi pi-file"        :label="t('stats.view.kpiPages')" :value="ov.total_pages"
                  :hint="ov.total_books > 0 ? t('stats.view.kpiPagesHint', { n: fmtNum(Math.round(ov.total_pages / Math.max(ov.total_books, 1))) }) : undefined" />
        <StatCard icon="pi pi-share-alt"   :label="t('stats.view.kpiActiveLoans')" :value="ov.active_loans"
                  :tone="ov.overdue_loans > 0 ? 'warn' : 'default'"
                  :hint="ov.overdue_loans > 0 ? t('stats.view.kpiOverdueHint', { n: ov.overdue_loans }) : undefined" />
        <StatCard icon="pi pi-bookmark"    :label="t('stats.view.kpiWishlist')" :value="ov.wishlist_count" tone="info" />
      </template>
    </section>

    <!-- Empty state globale -->
    <Message
      v-if="store.isEmpty && !store.loading"
      severity="info"
      :closable="false"
      class="stats-view__empty"
    >
      {{ t('stats.view.emptyLibrary') }}
    </Message>

    <!-- Charts grid -->
    <section v-if="!isInitialLoad && !store.isEmpty" class="stats-view__charts">
      <ChartCard
        :title="t('stats.view.chartAdditionsTitle')"
        :subtitle="t('stats.view.chartAdditionsSub')"
        :empty="!additionsData.datasets[0].data.some((v) => v > 0)"
        :empty-text="t('stats.view.chartAdditionsEmpty')"
        :height="260"
      >
        <Chart
          type="line"
          :data="additionsData"
          :options="additionsOpts"
          :aria-label="t('stats.view.chartAdditionsAria')"
          style="height: 260px"
        />
      </ChartCard>

      <ChartCard
        :title="t('stats.view.chartFormatTitle')"
        :subtitle="t('stats.view.chartFormatSub')"
        :empty="formatData.labels.length === 0"
        :height="260"
      >
        <Chart
          type="doughnut"
          :data="formatData"
          :options="formatOpts"
          :aria-label="t('stats.view.chartFormatAria')"
          style="height: 260px"
        />
      </ChartCard>

      <ChartCard
        :title="t('stats.view.chartLangTitle')"
        :subtitle="t('stats.view.chartLangSub')"
        :empty="languageData.labels.length === 0"
        :height="280"
      >
        <Chart
          type="bar"
          :data="languageData"
          :options="languageOpts"
          :aria-label="t('stats.view.chartLangAria')"
          style="height: 280px"
        />
      </ChartCard>

      <ChartCard
        :title="t('stats.view.chartGenreTitle')"
        :subtitle="t('stats.view.chartGenreSub')"
        :empty="genreData.labels.length === 0"
        :empty-text="t('stats.view.chartGenreEmpty')"
        :height="280"
      >
        <Chart
          type="bar"
          :data="genreData"
          :options="genreOpts"
          :aria-label="t('stats.view.chartGenreAria')"
          style="height: 280px"
        />
      </ChartCard>

      <ChartCard
        :title="t('stats.view.chartDecadeTitle')"
        :subtitle="t('stats.view.chartDecadeSub')"
        :empty="decadeData.labels.length === 0"
        :height="280"
      >
        <Chart
          type="bar"
          :data="decadeData"
          :options="decadeOpts"
          :aria-label="t('stats.view.chartDecadeAria')"
          style="height: 280px"
        />
      </ChartCard>

      <ChartCard
        :title="t('stats.view.chartLoansTitle')"
        :subtitle="t('stats.view.chartLoansSub')"
        :empty="!loansData.datasets.some((d) => d.data.some((v) => v > 0))"
        :empty-text="t('stats.view.chartLoansEmpty')"
        :height="280"
        class="stats-view__chart--wide"
      >
        <Chart
          type="line"
          :data="loansData"
          :options="loansOpts"
          :aria-label="t('stats.view.chartLoansAria')"
          style="height: 280px"
        />
      </ChartCard>
    </section>

    <!-- Top authors + shelf fill: layout a 2 colonne -->
    <section
      v-if="!isInitialLoad && !store.isEmpty"
      class="stats-view__lists"
    >
      <ChartCard
        :title="t('stats.view.topAuthorsTitle')"
        :subtitle="t('stats.view.topAuthorsSub')"
        :empty="topAuthors.length === 0"
        :height="0"
      >
        <ol class="rank-list" :aria-label="t('stats.view.topAuthorsAria')">
          <li v-for="(a, i) in topAuthors" :key="a.key" class="rank-list__item">
            <span class="rank-list__pos">{{ i + 1 }}</span>
            <div class="rank-list__bar-wrap">
              <span class="rank-list__name">{{ a.key }}</span>
              <div
                class="rank-list__bar"
                :style="{ transform: `scaleX(${a.count / maxAuthorCount})` }"
                aria-hidden="true"
              />
            </div>
            <span class="rank-list__count">{{ fmtNum(a.count) }}</span>
          </li>
        </ol>
      </ChartCard>

      <ChartCard
        :title="t('stats.view.shelfFillTitle')"
        :subtitle="t('stats.view.shelfFillSub')"
        :empty="shelfFill.length === 0"
        :empty-text="t('stats.view.shelfFillEmpty')"
        :height="0"
      >
        <ul class="shelf-list" :aria-label="t('stats.view.shelfFillAria')">
          <li v-for="s in shelfFill" :key="s.id" class="shelf-list__item">
            <div class="shelf-list__head">
              <span class="shelf-list__name">{{ s.name }}</span>
              <span class="shelf-list__count">
                {{ fmtNum(s.used) }} / {{ fmtNum(s.capacity) }}
                <strong class="shelf-list__pct">{{ fmtPct(s.pct) }}</strong>
              </span>
            </div>
            <div class="shelf-list__track" role="progressbar"
                 :aria-valuenow="Math.round(s.pct * 100)" aria-valuemin="0" aria-valuemax="100">
              <div
                class="shelf-list__fill"
                :style="{ transform: `scaleX(${Math.min(s.pct, 1)})`, background: shelfPctColor(s.pct) }"
              />
            </div>
          </li>
        </ul>
      </ChartCard>
    </section>
  </div>
</template>

<style scoped>
.stats-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 28px 40px;
  max-width: 1280px;
  margin: 0 auto;
}

/* Header */
.stats-view__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.stats-view__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.02em;
  color: var(--p-text-color);
}
.stats-view__subtitle {
  font-size: 13px;
  color: var(--p-text-muted-color);
  margin: 4px 0 0;
}
.stats-view__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stats-view__last {
  font-size: 12px;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

.stats-view__error,
.stats-view__empty { margin: 0; }

/* KPI grid */
.stats-view__kpis {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

/* Charts grid */
.stats-view__charts {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
}
.stats-view__chart--wide { grid-column: 1 / -1; }

/* Lists row */
.stats-view__lists {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
}

/* Rank list (top authors) */
.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rank-list__item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 12px;
}
.rank-list__pos {
  font-family: 'Lora', Georgia, serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rank-list__bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rank-list__name {
  font-size: 13px;
  color: var(--p-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-list__bar {
  height: 6px;
  width: 100%;
  background: var(--p-primary-500);
  border-radius: 3px;
  opacity: .85;
  /* scaleX su compositor (niente layout thrash); origine a sinistra. */
  transform-origin: left center;
  transition: transform var(--bk-dur-slow) var(--bk-ease-snappy);
}
.rank-list__count {
  font-size: 13px;
  color: var(--p-text-color);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Shelf fill list */
.shelf-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.shelf-list__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.shelf-list__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--p-text-color);
}
.shelf-list__count {
  font-size: 12px;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
}
.shelf-list__pct {
  font-weight: 600;
  color: var(--p-text-color);
}
.shelf-list__track {
  height: 8px;
  background: var(--p-content-border-color);
  border-radius: 4px;
  overflow: hidden;
}
.shelf-list__fill {
  height: 100%;
  width: 100%;
  border-radius: 4px;
  transform-origin: left center;
  transition: transform var(--bk-dur-slow) var(--bk-ease-snappy);
}

@media (prefers-reduced-motion: reduce) {
  .rank-list__bar,
  .shelf-list__fill { transition: none; }
}

/* Compact ai breakpoint stretti */
@media (max-width: 640px) {
  .stats-view { padding: 16px; }
  .stats-view__title { font-size: 22px; }
  .stats-view__charts,
  .stats-view__lists { grid-template-columns: 1fr; }
}
</style>
