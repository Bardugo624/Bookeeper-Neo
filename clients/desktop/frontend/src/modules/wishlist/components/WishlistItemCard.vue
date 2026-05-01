<script setup lang="ts">
/**
 * WishlistItemCard — singola voce della wishlist.
 *
 * Layout: header (titolo + priority badge), corpo (autori, ISBN, link),
 * footer (note + actions). Pensata per griglia responsive auto-fill.
 *
 * Eventi: edit, delete, convert (promuove a libro reale).
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { priorityMeta, splitAuthorsRaw, type WishlistItem } from '../types';

const props = defineProps<{
  item: WishlistItem;
  converting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit', item: WishlistItem): void;
  (e: 'delete', item: WishlistItem): void;
  (e: 'convert', item: WishlistItem): void;
}>();

const prio = computed(() => priorityMeta(props.item.priority));
const authors = computed(() => splitAuthorsRaw(props.item.authors ?? ''));

const sourceHost = computed<string | null>(() => {
  const url = props.item.source_url;
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
});

const createdAt = computed(() =>
  new Date(props.item.created_at * 1000).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }),
);
</script>

<template>
  <article
    class="wcard"
    :class="`wcard--prio-${item.priority}`"
    :aria-label="`${item.title}, priorità ${prio.label}`"
  >
    <header class="wcard__head">
      <h3 class="wcard__title" :title="item.title">{{ item.title }}</h3>
      <Tag :severity="prio.severity" rounded class="wcard__prio">
        <span class="wcard__prio-inner">
          <i :class="prio.icon" aria-hidden="true" />
          {{ prio.label }}
        </span>
      </Tag>
    </header>

    <ul v-if="authors.length" class="wcard__authors">
      <li v-for="(name, idx) in authors" :key="idx" class="wcard__author">
        <i class="pi pi-user" aria-hidden="true" />{{ name }}
      </li>
    </ul>
    <p v-else class="wcard__muted">— Autore non specificato —</p>

    <dl class="wcard__meta">
      <div v-if="item.isbn" class="wcard__meta-row">
        <dt>ISBN</dt>
        <dd class="wcard__mono">{{ item.isbn }}</dd>
      </div>
      <div v-if="sourceHost" class="wcard__meta-row">
        <dt>Fonte</dt>
        <dd>
          <a
            :href="item.source_url ?? '#'"
            target="_blank"
            rel="noopener noreferrer"
            class="wcard__link"
          >
            <i class="pi pi-external-link" aria-hidden="true" />
            {{ sourceHost }}
          </a>
        </dd>
      </div>
      <div class="wcard__meta-row">
        <dt>Aggiunto</dt>
        <dd>{{ createdAt }}</dd>
      </div>
    </dl>

    <p v-if="item.notes" class="wcard__notes">{{ item.notes }}</p>

    <footer class="wcard__actions">
      <Button
        icon="pi pi-check"
        label="Acquistato"
        size="small"
        severity="success"
        :loading="converting"
        @click="emit('convert', item)"
      />
      <Button
        icon="pi pi-pencil"
        label="Modifica"
        size="small"
        severity="secondary"
        outlined
        @click="emit('edit', item)"
      />
      <Button
        icon="pi pi-trash"
        aria-label="Elimina dalla wishlist"
        size="small"
        severity="danger"
        text
        @click="emit('delete', item)"
      />
    </footer>
  </article>
</template>

<style scoped>
.wcard {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1rem 1.125rem 0.875rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-left: 4px solid var(--p-surface-300);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 180ms ease;
}
.wcard:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
.wcard--prio-1 {
  border-left-color: var(--p-amber-500, #f59e0b);
}
.wcard--prio-2 {
  border-left-color: var(--p-red-500, #dc2626);
}
.wcard__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.wcard__title {
  font-family: 'Lora', Georgia, serif;
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.25;
  color: var(--p-surface-900);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.wcard__prio {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.wcard__prio-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.wcard__authors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
}
.wcard__author {
  font-size: 0.82rem;
  color: var(--p-surface-700);
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.wcard__author .pi {
  font-size: 0.7rem;
  opacity: 0.6;
}
.wcard__muted {
  margin: 0;
  font-size: 0.82rem;
  color: var(--p-surface-500);
  font-style: italic;
}
.wcard__meta {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem;
  font-size: 0.8rem;
}
.wcard__meta-row {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 0.5rem;
  margin: 0;
}
.wcard__meta-row dt {
  color: var(--p-surface-500);
  font-weight: 500;
  margin: 0;
}
.wcard__meta-row dd {
  margin: 0;
  color: var(--p-surface-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wcard__mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.78rem;
}
.wcard__link {
  color: var(--p-primary-600);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.wcard__link:hover {
  text-decoration: underline;
}
.wcard__notes {
  margin: 0;
  padding: 0.5rem 0.625rem;
  background: var(--p-surface-50);
  border-radius: 6px;
  font-size: 0.82rem;
  color: var(--p-surface-700);
  line-height: 1.45;
  white-space: pre-wrap;
}
.wcard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--p-surface-200);
}
@media (prefers-reduced-motion: reduce) {
  .wcard,
  .wcard:hover {
    transform: none;
    transition: none;
  }
}
</style>

<style>
html.dark .wcard {
  background: var(--p-surface-900);
  border-color: var(--p-surface-700);
  border-left-color: var(--p-surface-600);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
html.dark .wcard:hover {
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.4);
}
html.dark .wcard--prio-1 {
  border-left-color: var(--p-amber-400, #fbbf24);
}
html.dark .wcard--prio-2 {
  border-left-color: var(--p-red-400, #f87171);
}
html.dark .wcard__title {
  color: var(--p-surface-50);
}
html.dark .wcard__author {
  color: var(--p-surface-200);
}
html.dark .wcard__muted {
  color: var(--p-surface-400);
}
html.dark .wcard__meta-row dt {
  color: var(--p-surface-400);
}
html.dark .wcard__meta-row dd {
  color: var(--p-surface-100);
}
html.dark .wcard__notes {
  background: var(--p-surface-800);
  color: var(--p-surface-200);
}
html.dark .wcard__actions {
  border-top-color: var(--p-surface-700);
}
html.dark .wcard__link {
  color: var(--p-primary-300);
}
</style>
