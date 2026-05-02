<script setup lang="ts">
// AppShell — composizione: Sidebar + Topbar + <router-view/>.
// Stato locale: collassamento sidebar (persistito su localStorage).
//
// Ascolta inoltre l'evento Wails `session:expired` emesso dal backend Go
// quando il refresh JWT fallisce: aggiorna lo store auth e rimanda
// l'utente alla LoginView con `?expired=1` cos\u00ec compare un banner
// chiaro ("La tua sessione \u00e8 scaduta. Reinserisci la password.").
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { useAuthStore } from '@/stores/auth';
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';
import UpdateBanner from './UpdateBanner.vue';
import './AppShell.css';

const COLLAPSE_KEY = 'bookeeper:sidebar-collapsed';
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1');
watch(collapsed, (v) => localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'));

const router = useRouter();
const auth = useAuthStore();
let unsubscribeExpired: (() => void) | null = null;

onMounted(() => {
    unsubscribeExpired = EventsOn('session:expired', async () => {
        // Sincronizza lo store con lo stato Go (tokens svuotati).
        try { await auth.refreshSession(); } catch { /* best effort */ }
        const current = router.currentRoute.value;
        if (current.name === 'login') return;
        router.replace({
            name: 'login',
            query: { expired: '1', redirect: current.fullPath },
        });
    });
});

onBeforeUnmount(() => {
    if (unsubscribeExpired) unsubscribeExpired();
});
</script>

<template>
    <div class="shell" :class="{ 'shell--collapsed': collapsed }">
        <AppSidebar :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />
        <div class="shell__main">
            <AppTopbar />
            <UpdateBanner />
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
