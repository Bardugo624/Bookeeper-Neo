// Bookeeper Neo Mobile Web — bootstrap.
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { BookeeperPreset } from '@desktop-theme/index';

import App from './App.vue';
import { router } from './router';
import { initPwaUpdate } from './composables/usePwaUpdate';

import 'primeicons/primeicons.css';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
    theme: {
        preset: BookeeperPreset,
        options: {
            darkModeSelector: 'system',
            cssLayer: false,
        },
    },
    ripple: true,
});

app.mount('#app');

// Register the service worker after the app mounts so the first paint isn't
// blocked by SW install. Safe to call in dev too — vite-plugin-pwa is a
// no-op when devOptions.enabled is false.
initPwaUpdate();
