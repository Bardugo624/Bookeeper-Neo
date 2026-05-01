<script setup lang="ts">
/**
 * Empty state shown when the PWA loads with no credentials and no `?pair=`
 * deep link in the URL. Tells the user how to bootstrap the device.
 *
 * Intentionally has no input fields: the only path to pairing is the QR on
 * the desktop app (no manual code entry to keep attack surface minimal and
 * UX simple).
 */
</script>

<template>
    <main class="welcome">
        <div class="welcome__hero">
            <svg
                class="welcome__mark"
                viewBox="0 0 64 64"
                aria-hidden="true"
            >
                <rect width="64" height="64" rx="14" fill="var(--p-primary-700)" />
                <path
                    d="M16 14h26a6 6 0 0 1 6 6v30H22a6 6 0 0 1-6-6V14z"
                    fill="none"
                    stroke="var(--p-primary-50)"
                    stroke-width="3"
                    stroke-linejoin="round"
                />
                <path
                    d="M16 44a6 6 0 0 1 6-6h26"
                    fill="none"
                    stroke="var(--p-primary-50)"
                    stroke-width="3"
                    stroke-linecap="round"
                />
            </svg>
            <h1 class="welcome__title">Bookeeper</h1>
            <p class="welcome__lede">
                Companion mobile per la tua libreria di casa.
            </p>
        </div>

        <ol class="welcome__steps">
            <li>
                <span class="welcome__step-num">1</span>
                <span>
                    Apri Bookeeper sul desktop e vai in
                    <strong>Dispositivi → Abbina mobile</strong>.
                </span>
            </li>
            <li>
                <span class="welcome__step-num">2</span>
                <span>
                    Inquadra il QR con la <strong>fotocamera</strong> del telefono.
                </span>
            </li>
            <li>
                <span class="welcome__step-num">3</span>
                <span>
                    Tocca la notifica del link che appare e l'app si apre già abbinata.
                </span>
            </li>
        </ol>

        <p class="welcome__hint">
            Il QR è valido per 10 minuti. Puoi rigenerarlo in qualsiasi momento dal desktop.
        </p>
    </main>
</template>

<style scoped>
.welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 2.5rem 1.5rem 2rem;
    gap: 2rem;
    background: var(--p-surface-50);
    min-height: 100dvh;
}

.welcome__hero {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
}

.welcome__mark {
    width: 72px;
    height: 72px;
}

.welcome__title {
    margin: 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--p-primary-700);
    letter-spacing: -0.01em;
}

.welcome__lede {
    margin: 0;
    color: var(--p-text-muted-color);
    max-width: 24rem;
    line-height: 1.5;
}

.welcome__steps {
    list-style: none;
    margin: 0;
    padding: 1.25rem;
    background: var(--p-surface-0);
    border-radius: 12px;
    border: 1px solid var(--p-surface-200);
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.welcome__steps li {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    color: var(--p-text-color);
    line-height: 1.5;
}

.welcome__step-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--p-primary-100);
    color: var(--p-primary-700);
    font-weight: 600;
    font-size: 0.85rem;
    display: grid;
    place-items: center;
    margin-top: 0.05rem;
}

.welcome__hint {
    margin: auto 0 0;
    text-align: center;
    color: var(--p-text-muted-color);
    font-size: 0.85rem;
    line-height: 1.55;
}
</style>
