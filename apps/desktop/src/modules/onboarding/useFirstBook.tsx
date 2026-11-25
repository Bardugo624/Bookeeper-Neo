import { useState, type ReactNode } from 'react';
import type { BookOut } from '@bookeeper/api';
import { useSession } from '../../session';
import { FirstBookCelebration } from './FirstBookCelebration';

const KEY = 'bookeeper.onboarding.firstBook.';

function alreadySeen(connectionId: string): boolean {
  try {
    return localStorage.getItem(KEY + connectionId) !== null;
  } catch {
    return false;
  }
}

function remember(connectionId: string) {
  try {
    localStorage.setItem(KEY + connectionId, '1');
  } catch {
    // Without storage the dialog may come back next time: harmless.
  }
}

/**
 * The celebration of the first book, once per connection. `celebrate(book)` is called when a creation
 * took the library from 0 to 1 books; `element` is the dialog to render.
 */
export function useFirstBook(onAnother: () => void): { celebrate(book: BookOut): void; element: ReactNode } {
  const connectionId = useSession((s) => s.connection?.id);
  const [book, setBook] = useState<BookOut | null>(null);
  const close = () => setBook(null);
  return {
    celebrate(created) {
      if (!connectionId || alreadySeen(connectionId)) return;
      remember(connectionId);
      setBook(created);
    },
    element: (
      <FirstBookCelebration
        book={book}
        onAnother={() => {
          close();
          onAnother();
        }}
        onClose={close}
      />
    ),
  };
}
