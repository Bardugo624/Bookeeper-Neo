<script setup lang="ts">
/**
 * Lista dispositivi (placeholder Phase B). Mostra il bottone primario per
 * abbinare un mobile via QR — punto di ingresso unico al flow di pairing.
 *
 * Phase C: tabella DataTable con nome/ID/last-seen/azioni (revoca).
 */
import { useRouter } from 'vue-router';
import Button from 'primevue/button';

const router = useRouter();

function pairMobile(): void {
    router.push({ name: 'devices-pair-mobile' });
}
</script>

<template>
    <div class="page">
        <header class="page__header">
            <div>
                <h1 class="page__title">Dispositivi</h1>
                <p class="page__sub">
                    Gestisci i client che possono accedere alla tua libreria.
                </p>
            </div>
            <Button
                label="Abbina mobile"
                icon="pi pi-qrcode"
                @click="pairMobile"
            />
        </header>

        <section class="page__placeholder">
            <i class="pi pi-mobile" aria-hidden="true" />
            <p>Nessun dispositivo aggiuntivo abbinato.</p>
            <small>
                Genera un QR per aggiungere il companion mobile e gestire la libreria
                anche dal telefono.
            </small>
        </section>
    </div>
</template>

<style scoped>
.page {
    padding: 1.5rem 2rem 2rem;
    max-width: 72rem;
    margin: 0 auto;
}

.page__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 2rem;
}

.page__title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--p-primary-800);
}

.page__sub {
    margin: 0.25rem 0 0;
    color: var(--p-text-muted-color);
}

.page__placeholder {
    text-align: center;
    padding: 4rem 1.5rem;
    background: var(--p-surface-0);
    border: 1px dashed var(--p-surface-300);
    border-radius: 12px;
    color: var(--p-text-muted-color);
}

.page__placeholder i {
    font-size: 2.5rem;
    color: var(--p-primary-400);
    display: block;
    margin-bottom: 0.75rem;
}

.page__placeholder p {
    margin: 0 0 0.25rem;
    font-weight: 600;
    color: var(--p-text-color);
}

.page__placeholder small {
    display: block;
    max-width: 28rem;
    margin: 0 auto;
    line-height: 1.55;
}
</style>
