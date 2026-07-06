<script setup lang="ts">
// AppSidebar — navigazione principale.
// Composto con NavItem groupings per sezione (main / system).
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { NAV_ITEMS } from './nav-config';

const { t } = useI18n();

defineProps<{ collapsed: boolean }>();
defineEmits<{ (e: 'toggle-collapse'): void }>();

const route = useRoute();
const router = useRouter();

const mainItems = computed(() => NAV_ITEMS.filter((i) => i.section === 'main'));
const systemItems = computed(() => NAV_ITEMS.filter((i) => i.section === 'system'));

function go(name: string) {
    if (route.name !== name) router.push({ name });
}
</script>

<template>
    <aside class="shell__sidebar" :aria-label="t('nav.sidebarAria')">
        <div class="shell__brand">
            <span class="shell__brand-mark" aria-hidden="true">
                <i class="pi pi-book"></i>
            </span>
            <span v-if="!collapsed" class="shell__brand-text">Bookeeper</span>
        </div>

        <div class="shell__nav-section">
            <span v-if="!collapsed" class="shell__nav-label">{{ t('nav.sectionMain') }}</span>
            <button
                v-for="item in mainItems"
                :key="item.name"
                type="button"
                class="shell__nav-item"
                :class="{ 'is-active': route.name === item.name }"
                :aria-current="route.name === item.name ? 'page' : undefined"
                :title="collapsed ? t(item.label) : undefined"
                @click="go(item.name)"
            >
                <i :class="item.icon" aria-hidden="true"></i>
                <span v-if="!collapsed" class="shell__nav-text">{{ t(item.label) }}</span>
            </button>
        </div>

        <div class="shell__nav-section">
            <span v-if="!collapsed" class="shell__nav-label">{{ t('nav.sectionSystem') }}</span>
            <button
                v-for="item in systemItems"
                :key="item.name"
                type="button"
                class="shell__nav-item"
                :class="{ 'is-active': route.name === item.name }"
                :aria-current="route.name === item.name ? 'page' : undefined"
                :title="collapsed ? t(item.label) : undefined"
                @click="go(item.name)"
            >
                <i :class="item.icon" aria-hidden="true"></i>
                <span v-if="!collapsed" class="shell__nav-text">{{ t(item.label) }}</span>
            </button>
        </div>

        <div class="shell__nav-spacer"></div>

        <button
            type="button"
            class="shell__collapse"
            :aria-label="collapsed ? t('nav.expand') : t('nav.collapse')"
            :aria-expanded="!collapsed"
            @click="$emit('toggle-collapse')"
        >
            <i :class="collapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'" aria-hidden="true"></i>
        </button>
    </aside>
</template>
