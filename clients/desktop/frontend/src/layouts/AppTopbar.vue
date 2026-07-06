<script setup lang="ts">
// AppTopbar — titolo pagina + azioni globali (toggle tema).
// `route.meta.title` è una CHIAVE i18n (es. 'nav.books'), tradotta qui.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '../stores/ui';

const route = useRoute();
const ui = useUiStore();
const { t } = useI18n();

const pageTitle = computed(() => {
    const key = route.meta?.title as string | undefined;
    return key ? t(key) : 'Bookeeper';
});

const themeIcon = computed(() => {
    if (ui.mode === 'system') return 'pi pi-desktop';
    return ui.isDark ? 'pi pi-sun' : 'pi pi-moon';
});

const themeLabel = computed(() => t(`common.theme.${ui.mode}`));
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
