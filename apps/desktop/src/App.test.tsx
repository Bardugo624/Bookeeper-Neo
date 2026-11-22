import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ApiError } from '@bookeeper/api';
import { App } from './App';

it('shows the connected version', async () => {
  render(<App client={{ health: async () => ({ status: 'ok', version: '2.0.0-dev', time: 't' }) }} locale="it" />);
  expect(await screen.findByText('Collegato · versione 2.0.0-dev')).toBeInTheDocument();
});

it('shows unreachable on failure', async () => {
  render(<App client={{ health: async () => { throw new ApiError(0, 'network', 'x'); } }} locale="it" />);
  expect(await screen.findByText('Libreria non raggiungibile')).toBeInTheDocument();
});
