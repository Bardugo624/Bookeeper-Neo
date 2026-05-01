<script setup lang="ts">
// AppTopbar — titolo pagina + azioni globali (toggle tema).
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '../stores/ui';

const route = useRoute();
const ui = useUiStore();

const pageTitle = computed(() => (route.meta?.title as string) ?? 'Bookeeper');

const themeIcon = computed(() => {
    if (ui.mode === 'system') return 'pi pi-desktop';
    return ui.isDark ? 'pi pi-sun' : 'pi pi-moon';
});

const themeLabel = computed(() => {
    if (ui.mode === 'system') return 'Tema: sistema (clicca per chiaro)';
    if (ui.mode === 'dark') return 'Tema: scuro (clicca per sistema)';
    return 'Tema: chiaro (clicca per scuro)';
});
</script>

<template>
    <header class="shell__topbar">
        <h1 class="shell__title">{{ pageTitle }}</h1>
        <div class="shell__actions">
            <button
                type="button"
                class="shell__icon-btn"
                :aria-label="themeLabel"
                :title="themeLabel"
                @click="ui.toggle()"
            >
                <i :class="themeIcon" aria-hidden="true"></i>
            </button>
        </div>
    </header>
</template>
