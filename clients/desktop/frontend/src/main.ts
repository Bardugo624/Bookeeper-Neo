import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import 'primeicons/primeicons.css';
import './style.css';
import App from './App.vue';
import { router } from './router';
import { registerGuards } from './router/guards';
import { useAuthStore } from './stores/auth';
import { BookeeperPreset } from './theme';
import { i18n } from './i18n';

const pinia = createPinia();

const app = createApp(App)
    .use(pinia)
    .use(router)
    .use(i18n)
    .use(PrimeVue, {
        theme: {
            preset: BookeeperPreset,
            options: {
                // Toggle dark mode by adding `.dark` class on <html>.
                darkModeSelector: '.dark',
                cssLayer: false,
            },
        },
        ripple: true,
    })
    .use(ToastService)
    .use(ConfirmationService);

registerGuards(router);

// Carica la sessione persistita PRIMA di mount, così la prima route
// risolta dal router sa già se l'utente è autenticato (evita lo
// "sfarfallio" /login → redirect → /books).
useAuthStore(pinia)
    .restore()
    .finally(() => app.mount('#app'));
