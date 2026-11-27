import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { AppProviders } from '../../../../app/AppProviders';
import { resetLocalePreferenceForTest } from '../../../../app/i18n';
import { fakePlatform } from '../../../../platform/testing';
import { setSystemLanguage } from '../../testkit';
import { AutostartBlock } from './AutostartBlock';

vi.setConfig({ testTimeout: 20000 });

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
  setSystemLanguage('it-IT');
});

const NAME = 'Apri Bookeeper all\'accesso al computer';

function renderBlock(opts: Parameters<typeof fakePlatform>[0]) {
  const platform = fakePlatform(opts);
  render(
    <AppProviders platform={platform}>
      <MemoryRouter>
        <AutostartBlock />
      </MemoryRouter>
    </AppProviders>,
  );
  return platform;
}

it('is absent without platform.autostart', async () => {
  renderBlock({});
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('switch')).toBeNull();
});

it('starts from get', async () => {
  renderBlock({ autostart: { on: true } });
  const sw = (await screen.findByRole('switch', { name: NAME })) as HTMLInputElement;
  await waitFor(() => expect(sw.checked).toBe(true));
  expect(screen.getByText(/Si apre ridotto a icona/)).toBeTruthy();
});

it('the switch calls set', async () => {
  const platform = renderBlock({ autostart: { on: false } });
  const set = vi.spyOn(platform.autostart!, 'set');
  const sw = (await screen.findByRole('switch', { name: NAME })) as HTMLInputElement;
  await waitFor(() => expect(sw.disabled).toBe(false));
  await userEvent.setup({ delay: null }).click(sw);
  expect(set).toHaveBeenCalledWith(true);
  await waitFor(() => expect(sw.checked).toBe(true));
});

it('a failure shows the message and puts the switch back', async () => {
  renderBlock({ autostart: { on: false, failSet: true } });
  const sw = (await screen.findByRole('switch', { name: NAME })) as HTMLInputElement;
  await waitFor(() => expect(sw.disabled).toBe(false));
  await userEvent.setup({ delay: null }).click(sw);
  expect(await screen.findByText('Non sono riuscito a cambiare l\'apertura all\'accesso.')).toBeTruthy();
  await waitFor(() => expect(sw.checked).toBe(false));
});
