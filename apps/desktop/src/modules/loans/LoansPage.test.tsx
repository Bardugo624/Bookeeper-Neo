import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DAY, book, loan, loanListCalls, renderLoans, type Store } from './testkit';

const store = (over: Partial<Store> = {}): Store => ({
  loans: [
    loan(1, { due_at: 1_700_000_000 + 30 * DAY }),
    loan(2, { due_at: 1_600_000_000, overdue: true }),
    loan(3, { returned_at: 1_700_100_000 }),
  ],
  books: [book(4), book(5)],
  ...over,
});

const cards = () => within(screen.getByRole('list', { name: 'Prestiti' })).getAllByRole('listitem');

describe('list and counts', () => {
  it('shows skeletons, then the open loans as cards with the counts line', async () => {
    renderLoans(store());
    expect(await screen.findByRole('list', { name: 'Caricamento dei prestiti' })).toBeInTheDocument();
    await screen.findByText('Libro 1');
    expect(cards()).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 1, name: 'Prestiti' })).toBeInTheDocument();
    expect(await screen.findByText('2 in corso · 1 in ritardo')).toBeInTheDocument();
    expect(screen.getByText('A Persona 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apri la scheda di Libro 1' })).toHaveAttribute('href', '/books/b1');
  });

  it('counts with zero loans', async () => {
    renderLoans(store({ loans: [] }));
    expect(await screen.findByText('0 in corso · 0 in ritardo')).toBeInTheDocument();
  });
});

describe('filters', () => {
  it('sends the right status for each tab and keeps it in the address', async () => {
    const user = userEvent.setup();
    const { platform, router } = renderLoans(store());
    await screen.findByText('Libro 1');
    expect(loanListCalls(platform).some((p) => p.get('status') === 'active' && p.get('limit') === '50')).toBe(true);
    expect(router.state.location.search).toBe('');

    await user.click(screen.getByRole('tab', { name: 'In ritardo' }));
    await screen.findByText('Libro 2');
    expect(cards()).toHaveLength(1);
    expect(router.state.location.search).toBe('?filter=overdue');
    expect(loanListCalls(platform).some((p) => p.get('status') === 'overdue' && p.get('limit') === '50')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Restituiti' }));
    await screen.findByText('Libro 3');
    expect(router.state.location.search).toBe('?filter=returned');
    expect(screen.getByText('Restituito')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Tutti' }));
    await screen.findByText('Libro 1');
    expect(cards()).toHaveLength(3);
    expect(router.state.location.search).toBe('?filter=all');
  });

  it('starts from the address and filters by book', async () => {
    const user = userEvent.setup();
    const { platform, router } = renderLoans(store(), '/loans?filter=all&book=b2');
    await screen.findByText('Libro 2');
    expect(cards()).toHaveLength(1);
    expect(loanListCalls(platform).some((p) => p.get('book_id') === 'b2' && p.get('status') === 'all')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Mostra tutti' }));
    await screen.findByText('Libro 1');
    expect(router.state.location.search).toBe('?filter=all');
  });
});

describe('empty and error states', () => {
  it.each([
    ['/loans', 'Nessun prestito in corso'],
    ['/loans?filter=overdue', 'Nessun prestito in ritardo'],
    ['/loans?filter=returned', 'Nessun prestito restituito'],
    ['/loans?filter=all', 'Nessun prestito'],
  ])('%s says "%s"', async (route, title) => {
    renderLoans(store({ loans: [] }), route);
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('shows the error with a retry that works', async () => {
    const s = store({ failList: true });
    renderLoans(s);
    await screen.findByText('Non riesco a caricare i prestiti');
    s.failList = false;
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByText('Libro 1');
  });
});

describe('card status', () => {
  it('marks every card with data-status and an explicit label', async () => {
    renderLoans(store(), '/loans?filter=all');
    await screen.findByText('Libro 3');
    const [open, late, done] = cards();
    expect(open).toHaveAttribute('data-status', 'active');
    expect(late).toHaveAttribute('data-status', 'overdue');
    expect(done).toHaveAttribute('data-status', 'returned');
    expect(within(late!).getByText('In ritardo')).toBeInTheDocument();
    expect(within(done!).getByText('Restituito')).toBeInTheDocument();
  });

  it('has no coloured side border in the stylesheets of the module', () => {
    const files = readdirSync(__dirname).filter((f) => f.endsWith('.module.css'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const css = readFileSync(join(__dirname, f), 'utf8');
      expect(css, f).not.toMatch(/border-(left|right|inline-start|inline-end)\s*:/);
    }
  });

  it('keeps the cover link from styling the placeholder initial', async () => {
    const css = readFileSync(join(__dirname, 'LoanCard.module.css'), 'utf8');
    const rule = /\.cover\s*{([^}]*)}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/text-decoration:\s*none/);
    expect(rule).toMatch(/color:\s*inherit/);
    expect(css).toMatch(/\.cover:focus-visible\s*{[^}]*outline:/);
    renderLoans(store());
    const link = await screen.findByRole('link', { name: 'Apri la scheda di Libro 1' });
    expect(link.className).toContain('cover');
  });

  it('tints the whole border by status and veils only the overdue background', () => {
    const css = readFileSync(join(__dirname, 'LoanCard.module.css'), 'utf8');
    const rule = (status: string) => new RegExp(`\\[data-status='${status}'\\]\\s*{([^}]*)}`).exec(css)?.[1] ?? '';
    expect(rule('active')).toMatch(/border-color:\s*color-mix/);
    expect(rule('overdue')).toMatch(/border-color:\s*color-mix/);
    expect(rule('overdue')).toMatch(/background:/);
    expect(rule('active')).not.toMatch(/background/);
    expect(rule('returned')).not.toMatch(/background/);
  });
});

describe('permissions', () => {
  it('draws no action button for a guest', async () => {
    renderLoans(store({ role: 'guest' }), '/loans?filter=all');
    await screen.findByText('Libro 3');
    for (const name of ['Nuovo prestito', 'Segna come restituito', 'Riapri', 'Modifica', 'Elimina']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryAllByRole('button').filter((b) => b.closest('li'))).toHaveLength(0);
  });

  it('shows them to a member', async () => {
    renderLoans(store({ role: 'member' }), '/loans?filter=all');
    await screen.findByText('Libro 3');
    expect(screen.getByRole('button', { name: 'Nuovo prestito' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Modifica' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Riapri' })).toBeInTheDocument();
  });
});
