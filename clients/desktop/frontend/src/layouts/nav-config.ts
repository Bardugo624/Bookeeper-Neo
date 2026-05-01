// Bookeeper Neo — definizioni di navigazione condivise.
// Mantenute in TS puro (no Vue) per essere riutilizzabili da sidebar,
// command palette, breadcrumb, ecc.

export interface NavItem {
    /** Nome route Vue Router. */
    name: string;
    /** Etichetta i18n-ready (per ora hard-coded it-IT). */
    label: string;
    /** Classe icona PrimeIcons (es. `pi pi-book`). */
    icon: string;
    /** Sezione di raggruppamento nella sidebar. */
    section: 'main' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
    { name: 'books', label: 'Libreria', icon: 'pi pi-book', section: 'main' },
    { name: 'loans', label: 'Prestiti', icon: 'pi pi-share-alt', section: 'main' },
    { name: 'wishlist', label: 'Wishlist', icon: 'pi pi-heart', section: 'main' },
    { name: 'stats', label: 'Statistiche', icon: 'pi pi-chart-bar', section: 'main' },
    { name: 'devices', label: 'Dispositivi', icon: 'pi pi-mobile', section: 'system' },
    { name: 'settings', label: 'Impostazioni', icon: 'pi pi-cog', section: 'system' },
];
