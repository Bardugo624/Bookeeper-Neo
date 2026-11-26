import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalePreferenceForTest } from '../../app/i18n';
import { THEME_KEY } from '../../theme';
import { resetThemeForTest } from '../../theme/useTheme';
import { useSession } from '../../session';
import { renderSettings } from './testkit';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  resetLocalePreferenceForTest();
  resetThemeForTest();
});

describe('appearance', () => {
  it('applies and stores the chosen theme', async () => {
    renderSettings({}, '/settings/appearance');
    const group = await screen.findByRole('tablist', { name: 'Tema' });
    await userEvent.click(within(group).getByRole('tab', { name: 'Scuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(within(group).getByRole('tab', { name: 'Scuro' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(group).getByRole('tab', { name: 'Chiaro' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('switches to English without reloading and sets <html lang>', async () => {
    renderSettings({}, '/settings/appearance');
    expect(await screen.findByRole('heading', { level: 2, name: 'Lingua' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('it');
    await userEvent.click(screen.getByRole('tab', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appearance' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('bookeeper.locale')).toBe('en');
  });

  it('"System" follows navigator.language', async () => {
    renderSettings({}, '/settings/appearance', { language: 'en-US' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Language' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    const group = screen.getByRole('tablist', { name: 'Language' });
    expect(within(group).getByRole('tab', { name: 'System' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the choice after a new mount', async () => {
    const first = renderSettings({}, '/settings/appearance');
    await userEvent.click(await screen.findByRole('tab', { name: 'English' }));
    first.unmount();
    resetLocalePreferenceForTest();
    renderSettings({}, '/settings/appearance');
    expect(await screen.findByRole('heading', { level: 2, name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'English' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('account', () => {
  const fill = async (current: string | null, next: string, confirm: string) => {
    if (current !== null) await userEvent.type(screen.getByLabelText('Password attuale'), current);
    await userEvent.type(screen.getByLabelText('Nuova password'), next);
    await userEvent.type(screen.getByLabelText('Ripeti la nuova password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Salva la password' }));
  };

  it('shows name and email read-only', async () => {
    renderSettings({}, '/settings/account');
    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('anna@example.org')).toBeInTheDocument();
  });

  it('checks the minimum length and the confirmation before sending', async () => {
    const { platform } = renderSettings({}, '/settings/account');
    await screen.findByLabelText('Nuova password');
    await fill(null, 'corta', 'diversa');
    expect(await screen.findByText('La password deve avere almeno 8 caratteri.')).toBeInTheDocument();
    expect(screen.getByText('Le due password non coincidono.')).toBeInTheDocument();
    expect(platform.calls.some((c) => c.path.endsWith('/auth/password'))).toBe(false);
  });

  it('sends the current and new password, then clears the fields and shows a toast', async () => {
    const { platform } = renderSettings({}, '/settings/account');
    await screen.findByLabelText('Nuova password');
    await fill('vecchia-pw', 'nuova-password', 'nuova-password');
    expect(await screen.findByText('Password salvata')).toBeInTheDocument();
    const call = platform.calls.find((c) => c.path.endsWith('/auth/password'))!;
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ current_password: 'vecchia-pw', new_password: 'nuova-password' });
    expect(screen.getByLabelText('Password attuale')).toHaveValue('');
    expect(screen.getByLabelText('Nuova password')).toHaveValue('');
    expect(screen.getByLabelText('Ripeti la nuova password')).toHaveValue('');
  });

  it('omits the current password when there is none', async () => {
    const { platform } = renderSettings({}, '/settings/account');
    await screen.findByLabelText('Nuova password');
    await fill(null, 'nuova-password', 'nuova-password');
    await screen.findByText('Password salvata');
    expect(platform.calls.find((c) => c.path.endsWith('/auth/password'))!.body).toEqual({ current_password: null, new_password: 'nuova-password' });
  });

  it('puts a wrong current password next to its field', async () => {
    renderSettings({ password: () => ({ status: 401, body: { error_code: 'invalid_credentials', message: 'x' } }) }, '/settings/account');
    await screen.findByLabelText('Nuova password');
    await fill('sbagliata', 'nuova-password', 'nuova-password');
    const field = screen.getByLabelText('Password attuale');
    await waitFor(() => expect(field).toHaveAccessibleDescription(/La password attuale non è corretta/));
    expect(field).toBeInvalid();
    expect(screen.queryByText('Password salvata')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nuova password')).toHaveValue('nuova-password');
  });

  it('asks for the current password when the core says it is required', async () => {
    renderSettings({ password: () => ({ status: 409, body: { error_code: 'password_required', message: 'x' } }) }, '/settings/account');
    await screen.findByLabelText('Nuova password');
    await fill(null, 'nuova-password', 'nuova-password');
    expect(await screen.findByText('Scrivi la password attuale.')).toBeInTheDocument();
  });

  it('explains the password of a local library', async () => {
    renderSettings({ connection: { kind: 'local' } }, '/settings/account');
    expect(await screen.findByText(/condividi in rete o se inviti/)).toBeInTheDocument();
  });

  it('says an email is needed when the account has none', async () => {
    renderSettings({ email: null }, '/settings/account');
    expect(await screen.findByText(/serve prima un indirizzo email/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nuova password')).not.toBeInTheDocument();
  });

  it('signs out of this device', async () => {
    renderSettings({}, '/settings/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Esci da questo dispositivo' }));
    await waitFor(() => expect(useSession.getState().status).toBe('welcome'));
  });
});

describe('library', () => {
  it('describes a local library', async () => {
    renderSettings({ connection: { kind: 'local' }, role: 'member' }, '/settings/library');
    const card = within(await screen.findByRole('region', { name: 'La tua libreria' }));
    expect(card.getByText('Casa Rossi')).toBeInTheDocument();
    expect(card.getByText('Su questo computer')).toBeInTheDocument();
    expect(card.getByText('Membro')).toBeInTheDocument();
  });

  it('describes a remote library with its address', async () => {
    renderSettings({ connection: { kind: 'remote', url: 'https://libri.example.org' } }, '/settings/library');
    const card = within(await screen.findByRole('region', { name: 'La tua libreria' }));
    expect(card.getByText('Sul server https://libri.example.org')).toBeInTheDocument();
    expect(card.getByText('Proprietario')).toBeInTheDocument();
  });

  it('"Usa un\'altra libreria" signs out', async () => {
    const { platform } = renderSettings({}, '/settings/library');
    await userEvent.click(await screen.findByRole('button', { name: "Usa un'altra libreria" }));
    await waitFor(() => expect(useSession.getState().status).toBe('welcome'));
    expect(platform.calls.some((c) => c.path.endsWith('/auth/logout'))).toBe(true);
  });
});

describe('about', () => {
  it('shows app and server versions and the server mode', async () => {
    renderSettings({ health: { version: '2.3.4' }, server: { phone_ready: false, public_url: null, tls: 'acme' } }, '/settings/about');
    expect(await screen.findByText('2.3.4')).toBeInTheDocument();
    expect(screen.getByText('2.0.0')).toBeInTheDocument();
    expect(await screen.findByText('Cifrata, con indirizzo pubblico')).toBeInTheDocument();
  });

  it('explains why a phone cannot connect yet', async () => {
    renderSettings({ server: { phone_ready: false, public_url: null } }, '/settings/about');
    expect(await screen.findByText('Il telefono ha bisogno di un indirizzo sicuro')).toBeInTheDocument();
    expect(screen.queryByText('Il telefono può collegarsi')).not.toBeInTheDocument();
  });

  it('says a phone can connect when the library is ready', async () => {
    renderSettings({ server: { phone_ready: true, public_url: 'https://libri.example.org' } }, '/settings/about');
    expect(await screen.findByText('Il telefono può collegarsi')).toBeInTheDocument();
    expect(screen.queryByText('Il telefono ha bisogno di un indirizzo sicuro')).not.toBeInTheDocument();
  });
});
