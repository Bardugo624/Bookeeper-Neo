/** Letters after `g` and the page they lead to ("go to"). */
export const GO_TO: ReadonlyArray<{ key: string; to: string }> = [
  { key: 'l', to: '/books' },
  { key: 's', to: '/shelves' },
  { key: 'p', to: '/loans' },
  { key: 'w', to: '/wishlist' },
  { key: 't', to: '/stats' },
  { key: 'd', to: '/devices' },
  { key: 'i', to: '/settings' },
];

export const NEW_BOOK_PATH = '/books?new=1';

/** How long `g` waits for its second key. */
export const SEQUENCE_MS = 1500;

/** The shortcuts shown in the list; `keys` are rendered one `Kbd` each, `mod` is Ctrl or Cmd. */
export const SHORTCUT_ROWS: ReadonlyArray<{ id: string; keys: readonly string[] }> = [
  { id: 'palette', keys: ['mod', 'K'] },
  { id: 'search', keys: ['/'] },
  { id: 'goTo', keys: ['g', 'l · s · p · w · t · d · i'] },
  { id: 'newBook', keys: ['n'] },
  { id: 'help', keys: ['?'] },
  { id: 'close', keys: ['Esc'] },
];
