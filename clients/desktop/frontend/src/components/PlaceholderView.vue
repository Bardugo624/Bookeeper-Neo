<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
    <section class="placeholder" aria-labelledby="ph-title">
        <div class="placeholder__icon" aria-hidden="true">
            <slot name="icon">📦</slot>
        </div>
        <h2 id="ph-title" class="placeholder__title">{{ title }}</h2>
        <p v-if="subtitle" class="placeholder__sub">{{ subtitle }}</p>
        <p class="placeholder__hint">Questa schermata sarà implementata nelle prossime fasi.</p>
    </section>
</template>

<style scoped>
.placeholder {
    max-width: 480px;
    margin: 4rem auto;
    text-align: center;
    padding: 2rem;
    border-radius: 16px;
    background: var(--p-surface-0);
    border: 1px solid var(--p-surface-200);
}
.placeholder__icon {
    font-size: 2.25rem;
    margin-bottom: 0.75rem;
}
.placeholder__title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
    letter-spacing: -0.01em;
}
.placeholder__sub {
    color: var(--p-surface-600);
    margin: 0 0 1rem;
}
.placeholder__hint {
    color: var(--p-surface-500);
    font-size: 0.875rem;
    margin: 0;
}
</style>

<!-- Vedi BooksListView.vue per la nota sul bug `:global(html.dark)`. -->
<style>
html.dark .placeholder {
    background: var(--p-surface-800);
    border-color: var(--p-surface-700);
}
html.dark .placeholder__sub {
    color: var(--p-surface-300);
}
html.dark .placeholder__hint {
    color: var(--p-surface-400);
}
</style>
