<script setup lang="ts">
/**
 * Phase B placeholder. Phase D wires this to /api/v1/books FTS search with
 * debounced input, virtualized list, and pull-to-refresh.
 */
</script>

<template>
    <section class="tab" aria-labelledby="tab-search-title">
        <header class="tab__header">
            <h1 id="tab-search-title" class="tab__title">Cerca</h1>
            <p class="tab__sub">Catalogo libri della tua libreria</p>
        </header>
        <div class="tab__placeholder">
            <i class="pi pi-search tab__placeholder-icon" aria-hidden="true" />
            <p>Pronto per la Phase D — ricerca FTS, infinite scroll, dettaglio libro.</p>
        </div>
    </section>
</template>

<style scoped>
@import './_tab.css';
</style>
