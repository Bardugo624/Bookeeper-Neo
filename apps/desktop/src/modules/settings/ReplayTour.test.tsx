import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { module as tour } from '../tour/routes';
import { resetTourForTest, useTourStore } from '../tour/store';
import { module } from './routes';
import { renderSettings } from './testkit';

const state = () => useTourStore.getState();

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
});

describe('«Rivedi il tutorial»', () => {
  it('is a secondary button with a line that says what it does, in the library section', async () => {
    renderSettings({}, '/settings/library', { modules: [module, tour] });
    const button = await screen.findByRole('button', { name: 'Rivedi il tutorial' });
    expect(screen.getByText(/Riparte dal primo passo/)).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('starts explore from the first step after «Salta il tutorial», for a guest', async () => {
    renderSettings({ role: 'guest' }, '/settings/library', { modules: [module, tour] });
    const button = await screen.findByRole('button', { name: 'Rivedi il tutorial' });
    useTourStore.setState({ pathId: 'explore', step: 2, status: 'skipped' });
    await userEvent.click(button);
    await waitFor(() => expect(state().status).toBe('running'));
    expect(state().pathId).toBe('explore');
    expect(state().step).toBe(0);
  });
});
