// Bookeeper Neo — definizioni di navigazione condivise.
// Mantenute in TS puro (no Vue) per essere riutilizzabili da sidebar,
// command palette, breadcrumb, ecc.

export interface NavItem {
    /** Nome route Vue Router. */
    name: string;
    /** Chiave i18n dell'etichetta (tradotta da chi renderizza). */
    label: string;
    /** Classe icona PrimeIcons (es. `pi pi-book`). */
    icon: string;
    /** Sezione di raggruppamento nella sidebar. */
    section: 'main' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
    { name: 'books', label: 'nav.books', icon: 'pi pi-book', section: 'main' },
    { name: 'shelves', label: 'nav.shelves', icon: 'pi pi-th-large', section: 'main' },
    { name: 'loans', label: 'nav.loans', icon: 'pi pi-share-alt', section: 'main' },
    { name: 'wishlist', label: 'nav.wishlist', icon: 'pi pi-heart', section: 'main' },
    { name: 'stats', label: 'nav.stats', icon: 'pi pi-chart-bar', section: 'main' },
    { name: 'devices', label: 'nav.devices', icon: 'pi pi-mobile', section: 'system' },
    { name: 'settings', label: 'nav.settings', icon: 'pi pi-cog', section: 'system' },
];
