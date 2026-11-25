import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@bookeeper/api';
import { t } from '@bookeeper/i18n';
import { LocaleProvider } from '../app/i18n';
import { apiErrorMessage } from './apiErrorMessage';
import { BottomSheet } from './BottomSheet';
import { ErrorState } from './ErrorState';
import { ListRow } from './ListRow';
import { Screen } from './Screen';

const wrap = (ui: React.ReactNode) => (
  <MemoryRouter>
    <LocaleProvider locale="it">{ui}</LocaleProvider>
  </MemoryRouter>
);

describe('Screen', () => {
  it('names the region after its title and renders footer and actions', () => {
    render(wrap(<Screen title="Cerca" actions={<button>Filtri</button>} footer={<p>piede</p>}>corpo</Screen>));
    expect(screen.getByRole('region', { name: 'Cerca' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cerca' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtri' })).toBeInTheDocument();
    expect(screen.getByText('piede')).toBeInTheDocument();
  });
});

describe('ListRow', () => {
  it('is a link, a button or plain content', async () => {
    const onClick = vi.fn();
    render(
      wrap(
        <>
          <ListRow title="Dune" subtitle="Herbert" to="/books/1" />
          <ListRow title="Esci" onClick={onClick} />
          <ListRow title="Versione" trailing="2.0" />
        </>,
      ),
    );
    expect(screen.getByRole('link', { name: /Dune/ })).toHaveAttribute('href', '/books/1');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Esci' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText('Versione').closest('a,button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('shows the message and retries', async () => {
    const onRetry = vi.fn();
    render(wrap(<ErrorState message="Server spento" onRetry={onRetry} />));
    expect(screen.getByText('Server spento')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Riprova' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('BottomSheet', () => {
  function Demo() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Apri</button>
        <BottomSheet open={open} onOpenChange={setOpen} title="Fotocamera">
          <p>contenuto</p>
        </BottomSheet>
      </>
    );
  }

  it('opens as a dialog anchored to the bottom and closes with the button', async () => {
    const user = userEvent.setup();
    render(wrap(<Demo />));
    await user.click(screen.getByRole('button', { name: 'Apri' }));
    expect(screen.getByRole('dialog', { name: 'Fotocamera' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-bottom-sheet');
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-bottom-sheet');
  });
});

describe('apiErrorMessage', () => {
  const tr = (key: string, vars?: Record<string, string | number>) => t('it', key, vars);
  it('maps the core codes to text', () => {
    expect(apiErrorMessage(tr, new ApiError(0, 'network', 'x'))).toBe(tr('common.errors.network'));
    expect(apiErrorMessage(tr, new ApiError(409, 'slot_taken', 'x'))).toBe(tr('common.errors.conflict'));
    expect(apiErrorMessage(tr, new ApiError(429, 'rate_limited', 'x', 7))).toContain('7');
    expect(apiErrorMessage(tr, new ApiError(500, 'boom', 'x'))).toBe(tr('common.errors.generic'));
    expect(apiErrorMessage(tr, new Error('x'))).toBe(tr('common.errors.generic'));
    expect(apiErrorMessage(tr, new ApiError(401, 'invalid_code', 'x'), { invalid_code: 'Codice errato' })).toBe('Codice errato');
  });
});
