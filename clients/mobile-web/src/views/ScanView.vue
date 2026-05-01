<script setup lang="ts">
/**
 * Phase B placeholder. Phase D adds full-screen camera stream, BarcodeDetector
 * (with @zxing/browser fallback), and Open Library fallback metadata.
 */
</script>

<template>
    <section class="tab" aria-labelledby="tab-scan-title">
        <header class="tab__header">
            <h1 id="tab-scan-title" class="tab__title">Scan ISBN</h1>
            <p class="tab__sub">Scansiona il codice a barre del libro</p>
        </header>
        <div class="tab__placeholder">
            <i class="pi pi-camera tab__placeholder-icon" aria-hidden="true" />
            <p>Pronto per la Phase D — camera live, BarcodeDetector + ZXing fallback, Open Library lookup.</p>
        </div>
    </section>
</template>

<style scoped>
@import './_tab.css';
</style>
