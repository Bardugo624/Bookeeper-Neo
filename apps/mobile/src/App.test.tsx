import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('explains that a secure address is needed', () => {
  render(
    <App
      client={{
        health: async () => {
          throw new Error('unused');
        },
      }}
      locale="it"
      secure={false}
    />,
  );
  expect(screen.getByText(/serve un indirizzo sicuro/)).toBeInTheDocument();
  expect(screen.queryByText(/Collegato/)).toBeNull();
});

it('shows the connected version in a secure context', async () => {
  render(
    <App
      client={{ health: async () => ({ status: 'ok', version: '2.0.0-dev', time: 't' }) }}
      locale="it"
      secure
    />,
  );
  expect(await screen.findByText('Collegato · versione 2.0.0-dev')).toBeInTheDocument();
});
