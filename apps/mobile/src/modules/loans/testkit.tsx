import type { LoanOut, PersonOut } from '@bookeeper/api';
import { renderMobile } from '../../app/testing';
import { fakePlatform, type Handler, type RecordedCall } from '../../platform/testing';
import { ME, ok, pair } from '../../session/fixtures';
import { apiHandler, book } from '../search/testkit';
import { module as searchModule } from '../search/routes';
import { module } from './routes';

export const DAY = 86_400;
export const now = () => Math.floor(Date.now() / 1000);

export const loan = (n: number, over: Partial<LoanOut> = {}): LoanOut =>
  ({
    id: `l${n}`,
    book_id: `b${n}`,
    book_title: `Libro ${n}`,
    book_authors: [],
    borrower_name: `Persona ${n}`,
    lent_at: now() - 30 * DAY,
    overdue: false,
    ...over,
  }) as LoanOut;

export const person = (id: string, name: string, over: Partial<PersonOut> = {}): PersonOut =>
  ({ id, display_name: name, is_me: false, role: 'member', devices: 1, created_at: 1, ...over }) as PersonOut;

export interface LoansServer {
  loans?: LoanOut[];
  people?: PersonOut[];
  names?: string[];
  role?: 'owner' | 'admin' | 'member' | 'guest';
  /** Books of the library, for the book page. */
  books?: ReturnType<typeof book>[];
}

export const isReturn = (c: RecordedCall) => c.method === 'POST' && /\/loans\/[^/]+\/return$/.test(c.path);
export const isLend = (c: RecordedCall) => c.method === 'POST' && /\/loans$/.test(c.path);

export function loansHandler(server: LoansServer): Handler {
  const base = apiHandler({
    books: server.books ?? [],
    override: async (call) => {
      const url = new URL(call.path, 'http://x');
      const path = url.pathname.replace('/api/v1', '');
      if (path === '/me') return ok({ ...ME, user: { ...ME.user, role: server.role ?? 'owner' } });
      if (path === '/users') return ok({ items: server.people ?? [], total: (server.people ?? []).length });
      if (path === '/loans/borrowers') return ok({ items: server.names ?? [] });
      if (path === '/loans' && call.method === 'GET') {
        const status = url.searchParams.get('status') ?? 'active';
        const bookId = url.searchParams.get('book_id');
        const all = (server.loans ?? []).filter((l) => (status === 'returned' ? l.returned_at != null : l.returned_at == null));
        const items = all.filter((l) => !bookId || l.book_id === bookId);
        return ok({ items, total: items.length });
      }
      if (isLend(call)) return { status: 201, body: loan(9, { id: 'new' }) };
      if (isReturn(call)) return ok(loan(1, { returned_at: now() }));
      return undefined;
    },
  });
  return base;
}

/** The app with the loans and search modules, paired, on `route`. */
export function renderLoans(server: LoansServer = {}, route = '/loans') {
  const platform = fakePlatform({ handler: loansHandler(server) });
  pair(platform.storage);
  return { ...renderMobile({ platform, modules: [searchModule, module], route }), platform };
}
