<script setup lang="ts">
// AppShell — composizione: Sidebar + Topbar + <router-view/>.
// Stato locale: collassamento sidebar (persistito su localStorage).
import { ref, watch } from 'vue';
import { RouterView } from 'vue-router';
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';
import './AppShell.css';

const COLLAPSE_KEY = 'bookeeper:sidebar-collapsed';
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1');
watch(collapsed, (v) => localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'));
</script>

<template>
    <div class="shell" :class="{ 'shell--collapsed': collapsed }">
        <AppSidebar :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />
        <div class="shell__main">
            <AppTopbar />
            <main class="shell__content" tabindex="-1">
                <RouterView v-slot="{ Component }">
                    <transition name="fade" mode="out-in">
                        <component :is="Component" />
                    </transition>
                </RouterView>
            </main>
        </div>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
