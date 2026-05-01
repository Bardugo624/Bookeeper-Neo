<script setup lang="ts">
/**
 * Tabs shell: top-level navigation for the paired mobile experience.
 *
 * - Bottom nav with 3 items (well under MD's 5-item limit).
 * - Each item has icon + label (icon-only nav harms discoverability).
 * - Active state shown via color, weight, and a top "rail" indicator.
 * - Safe-area padding on the bottom so the home indicator (iOS) and
 *   gesture bar (Android) don't overlap targets.
 * - Touch targets ≥48px tall, ≥48px wide effective hit area.
 * - Reserves bottom inset on the scrollable region so content isn't hidden.
 */
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { usePwaUpdate } from '@/composables/usePwaUpdate';

const route = useRoute();
const router = useRouter();
const { needsRefresh, applyUpdate, dismissUpdate } = usePwaUpdate();

interface Tab {
    name: string;
    label: string;
    icon: string; // primeicons class
}

const tabs: Tab[] = [
    { name: 'search', label: 'Cerca', icon: 'pi-search' },
    { name: 'scan', label: 'Scan', icon: 'pi-camera' },
    { name: 'account', label: 'Account', icon: 'pi-user' },
];

const activeName = computed(() => route.name);

function go(name: string): void {
    if (name !== activeName.value) router.push({ name });
}
</script>

<template>
    <div class="shell">
        <main class="shell__content">
            <RouterView v-slot="{ Component }">
                <transition name="page" mode="out-in">
                    <keep-alive :include="['SearchView']">
                        <component :is="Component" />
                    </keep-alive>
                </transition>
            </RouterView>
        </main>

        <transition name="banner">
            <div
                v-if="needsRefresh"
                class="shell__update"
                role="status"
                aria-live="polite"
            >
                <i class="pi pi-sync shell__update-icon" aria-hidden="true" />
                <span class="shell__update-text">Aggiornamento disponibile</span>
                <button
                    type="button"
                    class="shell__update-action"
                    @click="applyUpdate"
                >
                    Ricarica
                </button>
                <button
                    type="button"
                    class="shell__update-dismiss"
                    aria-label="Ignora aggiornamento"
                    @click="dismissUpdate"
                >
                    <i class="pi pi-times" aria-hidden="true" />
                </button>
            </div>
        </transition>

        <nav class="shell__tabs" role="tablist" aria-label="Navigazione principale">
            <button
                v-for="tab in tabs"
                :key="tab.name"
                type="button"
                role="tab"
                class="shell__tab"
                :class="{ 'shell__tab--active': activeName === tab.name }"
                :aria-selected="activeName === tab.name"
                :aria-label="tab.label"
                @click="go(tab.name)"
            >
                <span class="shell__rail" aria-hidden="true" />
                <i :class="['pi', tab.icon, 'shell__icon']" aria-hidden="true" />
                <span class="shell__label">{{ tab.label }}</span>
            </button>
        </nav>
    </div>
</template>

<style scoped>
.shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 100dvh;
    background: var(--p-surface-50);
}

.shell__content {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    /* Reserve space so the bottom tab bar never covers content. */
    padding-bottom: calc(64px + env(safe-area-inset-bottom));
}

.shell__tabs {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: var(--p-surface-0);
    border-top: 1px solid var(--p-surface-200);
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 40;
    /* Subtle elevation rather than heavy shadow; on-style with editorial feel. */
    box-shadow: 0 -1px 0 var(--p-surface-200), 0 -8px 24px rgba(0, 0, 0, 0.04);
}

.shell__tab {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0.5rem 0.5rem 0.625rem;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.2rem;
    cursor: pointer;
    color: var(--p-text-muted-color);
    position: relative;
    transition: color 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
    /* iOS reduces tap-delay; explicit for older Safari */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

.shell__tab:active {
    /* Press feedback within 100ms (HIG): subtle scale, no layout shift. */
    transform: scale(0.96);
}

.shell__tab:focus-visible {
    outline: 2px solid var(--p-primary-500);
    outline-offset: -4px;
    border-radius: 8px;
}

.shell__rail {
    position: absolute;
    top: 0;
    left: 50%;
    width: 36px;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: var(--p-primary-500);
    transform: translateX(-50%) scaleX(0);
    transform-origin: center top;
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.shell__tab--active .shell__rail {
    transform: translateX(-50%) scaleX(1);
}

.shell__tab--active {
    color: var(--p-primary-700);
}

.shell__icon {
    font-size: 1.25rem;
    line-height: 1;
}

.shell__label {
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.01em;
}

.shell__tab--active .shell__label {
    font-weight: 600;
}

/* Page transition: slight crossfade + lift. Spatial continuity within tabs. */
.page-enter-active,
.page-leave-active {
    transition:
        opacity 180ms ease,
        transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.page-enter-from {
    opacity: 0;
    transform: translateY(6px);
}
.page-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
    .shell__tab,
    .shell__rail,
    .page-enter-active,
    .page-leave-active,
    .banner-enter-active,
    .banner-leave-active {
        transition: none;
    }
    .shell__tab:active {
        transform: none;
    }
}

/* --- PWA update banner --------------------------------------------------- */
.shell__update {
    position: fixed;
    left: 0.75rem;
    right: 0.75rem;
    /* Sits just above the bottom tab bar, with safe-area awareness. */
    bottom: calc(64px + env(safe-area-inset-bottom) + 0.5rem);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    background: var(--p-primary-700);
    color: var(--p-primary-50);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 0.875rem;
}

.shell__update-icon {
    font-size: 1rem;
}

.shell__update-text {
    flex: 1;
    font-weight: 500;
}

.shell__update-action {
    appearance: none;
    border: 0;
    background: var(--p-primary-50);
    color: var(--p-primary-800);
    font-weight: 600;
    font-size: 0.85rem;
    border-radius: 999px;
    min-height: 36px;
    padding: 0 0.875rem;
    cursor: pointer;
}

.shell__update-dismiss {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--p-primary-100);
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    cursor: pointer;
    border-radius: 50%;
}

.banner-enter-active,
.banner-leave-active {
    transition:
        opacity 200ms ease,
        transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.banner-enter-from,
.banner-leave-to {
    opacity: 0;
    transform: translateY(12px);
}
</style>
