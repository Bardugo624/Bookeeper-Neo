import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@bookeeper/api';
import { ErrorState } from './ErrorState';
import { KitWrapper } from './testing';

function setup(error: unknown, onRetry?: () => void) {
  render(
    <KitWrapper>
      <MemoryRouter initialEntries={['/people']}>
        <Routes>
          <Route path="/people" element={<ErrorState error={error} onRetry={onRetry} />} />
          <Route path="/books" element={<p>Pagina libri</p>} />
        </Routes>
      </MemoryRouter>
    </KitWrapper>,
  );
}

describe('ErrorState', () => {
  it('says it does not know when the cause is unknown, and offers a retry', async () => {
    const retry = vi.fn();
    setup(new TypeError('x.map is not a function'), retry);
    expect(screen.getByRole('heading', { name: 'Qualcosa non ha funzionato' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('names an unreachable library and offers a retry', () => {
    setup(new ApiError(0, 'network', 'down'), () => undefined);
    expect(screen.getByRole('heading', { name: 'La libreria non risponde' })).toBeInTheDocument();
    expect(screen.getByText(/verifica che sia acceso/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });

  it('names an expired session', () => {
    setup(new ApiError(401, 'unauthorized', 'no'), () => undefined);
    expect(screen.getByRole('heading', { name: 'La sessione è scaduta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument();
  });

  it('sends the user away instead of retrying when access is refused', async () => {
    setup(new ApiError(403, 'forbidden', 'no'), () => undefined);
    expect(screen.getByRole('heading', { name: 'Non hai accesso a questa pagina' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vai ai libri' }));
    expect(screen.getByText('Pagina libri')).toBeInTheDocument();
  });

  it('shows no button when there is nothing to retry', () => {
    setup(undefined);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
