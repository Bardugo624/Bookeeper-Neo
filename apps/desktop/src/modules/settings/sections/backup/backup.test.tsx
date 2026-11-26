import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalePreferenceForTest } from '../../../../app/i18n';
import { collectSections } from '../../sections';
import { fallbackBackupName, formatBytes, validateSchedule } from './backupFormat';
import { json, renderBackup } from './testkit';

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
});

const zip = () => new File([new Uint8Array([9, 9])], 'copia.zip', { type: 'application/zip' });

describe('visibility', () => {
  it('shows the section to admin and owner only', () => {
    expect(collectSections({ role: 'owner', platform: 'tauri' }).map((s) => s.id)).toContain('backup');
    expect(collectSections({ role: 'admin', platform: 'tauri' }).map((s) => s.id)).toContain('backup');
    expect(collectSections({ role: 'member', platform: 'tauri' }).map((s) => s.id)).not.toContain('backup');
    expect(collectSections({ role: null, platform: 'tauri' }).map((s) => s.id)).not.toContain('backup');
  });

  it('hides the restore from an admin', async () => {
    renderBackup({ role: 'admin' });
    await screen.findByRole('button', { name: 'Crea un backup' });
    expect(screen.queryByText('Ripristino')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Zona pericolosa' })).toBeNull();
  });
});

describe('backup now', () => {
  it('saves the archive with the name from the core', async () => {
    const { platform } = renderBackup({
      backup: () => ({ status: 200, bytes: new Uint8Array([1, 2, 3]), contentType: 'application/zip', headers: { 'content-disposition': 'attachment; filename="casa-2026.zip"' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Crea un backup' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    expect(platform.saved[0]!.suggestedName).toBe('casa-2026.zip');
    expect(Array.from(platform.saved[0]!.bytes)).toEqual([1, 2, 3]);
    expect(await screen.findByText('Backup salvato.')).toBeTruthy();
  });

  it('falls back to a dated name and stays silent when the user cancels', async () => {
    const { platform } = renderBackup();
    platform.setSaveResult({ saved: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Crea un backup' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    expect(platform.saved[0]!.suggestedName).toBe(fallbackBackupName());
    expect(screen.queryByText('Backup salvato.')).toBeNull();
    expect(screen.queryByRole('alert', { name: '' })?.textContent ?? '').toBe('');
  });
});

describe('schedule', () => {
  it('starts from the values of the core and saves changes', async () => {
    const { platform } = renderBackup({ config: { interval_days: 7, keep: 5 } });
    const interval = await screen.findByLabelText('Ogni quanti giorni');
    await waitFor(() => expect((interval as HTMLInputElement).value).toBe('7'));
    expect((screen.getByLabelText('Quanti tenerne') as HTMLInputElement).value).toBe('5');
    await userEvent.clear(interval);
    await userEvent.type(interval, '0');
    expect(screen.getByText('Spento: nessun backup automatico.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await screen.findByText('Programmazione salvata.');
    const put = platform.calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({ interval_days: 0, keep: 5 });
  });

  it('refuses values outside the limits without calling the core', async () => {
    const { platform } = renderBackup();
    const keep = await screen.findByLabelText('Quanti tenerne');
    await waitFor(() => expect((keep as HTMLInputElement).value).toBe('5'));
    await userEvent.clear(keep);
    await userEvent.type(keep, '51');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Inserisci un numero intero da 1 a 50.')).toBeTruthy();
    expect(platform.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('validates the same limits as the core', () => {
    expect(validateSchedule({ interval: '91', keep: '5' }).errors.interval).toBeDefined();
    expect(validateSchedule({ interval: '0', keep: '0' }).errors.keep).toBeDefined();
    expect(validateSchedule({ interval: '90', keep: '50' }).value).toEqual({ interval_days: 90, keep: 50 });
  });
});

describe('automatic backups', () => {
  it('lists date and readable size', async () => {
    renderBackup({ items: [{ name: 'a.zip', created_at: 1_767_225_600, size_bytes: 1_572_864 }] });
    expect(await screen.findByText('1,5 MB')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Backup automatici' }).textContent).toMatch(/2026/);
    expect(screen.queryByRole('button', { name: /scarica/i })).toBeNull();
  });

  it('says so when there are none', async () => {
    renderBackup();
    expect(await screen.findByText('Non c\'è ancora nessun backup automatico.')).toBeTruthy();
  });

  it('formats sizes', () => {
    expect(formatBytes('it', 512)).toBe('512 B');
    expect(formatBytes('en', 2048)).toBe('2 KB');
  });
});

async function pickAndOpen() {
  const input = (await screen.findByLabelText('File di backup (.zip)')) as HTMLInputElement;
  await userEvent.upload(input, zip());
  await userEvent.click(screen.getByRole('button', { name: 'Ripristina da file…' }));
  return screen.findByRole('dialog');
}

describe('restore', () => {
  it('lives in the danger zone with its consequence, and the confirmation is danger-toned', async () => {
    renderBackup({});
    const zone = await screen.findByRole('region', { name: 'Zona pericolosa' });
    expect(within(zone).getByRole('button', { name: 'Ripristina da file…' })).toBeTruthy();
    expect(within(zone).getByText(/Non si può annullare/)).toBeTruthy();
    expect(within(zone).queryByRole('button', { name: 'Crea un backup' })).toBeNull();
    const dialog = await pickAndOpen();
    expect(dialog.className).toMatch(/danger/);
  });

  it('enables "Ripristina" only when the library name matches, then asks for the password', async () => {
    const tokens: Array<string | undefined> = [];
    const { platform } = renderBackup({
      restore: (token) => {
        tokens.push(token);
        return token
          ? json(200, { books: 3, shelves: 2, loans: 1, wishlist: 4, covers: 5, users_remapped: 2 })
          : json(401, { error_code: 'confirmation_required', message: 'x' });
      },
    });
    const dialog = await pickAndOpen();
    const go = within(dialog).getByRole('button', { name: 'Ripristina' });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByRole('textbox'), 'Casa Rossi');
    expect((go as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(go);

    const pw = await screen.findByLabelText('Password');
    await userEvent.type(pw, 'segreta{Enter}');
    expect(await screen.findByText('Ripristino completato. Nella libreria ci sono ora:')).toBeTruthy();
    expect(tokens).toEqual([undefined, 'tok']);
    expect(screen.getByText('2 utenti del backup non esistono in questa libreria.')).toBeTruthy();
    const restores = platform.calls.filter((c) => c.path === '/api/v1/restore');
    expect(restores).toHaveLength(2);
    expect(Array.from(restores[1]!.body as Uint8Array)).toEqual([9, 9]);
  });

  it('shows invalid_archive and refreshes nothing', async () => {
    const { platform } = renderBackup({
      restore: () => json(400, { error_code: 'invalid_archive', message: 'The backup archive is not valid: x' }),
    });
    // The core asks for confirmation only when it gets that far: here it rejects the archive at once.
    const dialog = await pickAndOpen();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Casa Rossi');
    const before = platform.calls.filter((c) => c.path === '/api/v1/backups').length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ripristina' }));
    expect(await screen.findByText('Il file non è un backup valido di Bookeeper.')).toBeTruthy();
    expect(platform.calls.filter((c) => c.path === '/api/v1/backups')).toHaveLength(before);
    expect(screen.queryByText('Ripristino completato. Nella libreria ci sono ora:')).toBeNull();
  });

  it('names an unsupported version and a file that is too large', async () => {
    let answer = json(400, { error_code: 'invalid_archive', message: 'The backup archive is not valid: unknown archive format or version' });
    renderBackup({ restore: () => answer });
    let dialog = await pickAndOpen();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Casa Rossi');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ripristina' }));
    expect(await screen.findByText('Questo backup è di una versione che questa app non sa leggere.')).toBeTruthy();
    answer = json(413, { error_code: 'payload_too_large', message: 'x' });
    dialog = await pickAndOpen();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Casa Rossi');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ripristina' }));
    expect(await screen.findByText('Il file è troppo grande per essere ripristinato.')).toBeTruthy();
  });
});

describe('restore layout', () => {
  it('puts the action and its consequence before the file picker, and says what is missing', async () => {
    renderBackup({});
    const input = await screen.findByLabelText('File di backup (.zip)');
    const title = screen.getByText('Ripristina da file');
    expect(title.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/solo il proprietario/)).toBeTruthy();
    expect(screen.getByText('Scegli prima un file di backup.')).toBeTruthy();
    await userEvent.upload(input as HTMLInputElement, zip());
    expect(screen.queryByText('Scegli prima un file di backup.')).toBeNull();
  });
});

describe('one operation at a time', () => {
  it('blocks the restore while a backup is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { platform } = renderBackup({
      backup: async () => {
        await gate;
        return { status: 200, bytes: new Uint8Array([1]), contentType: 'application/zip', headers: {} };
      },
    });
    const input = (await screen.findByLabelText('File di backup (.zip)')) as HTMLInputElement;
    await userEvent.upload(input, zip());
    const restore = screen.getByRole('button', { name: 'Ripristina da file…' });
    expect((restore as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Crea un backup' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Ripristina da file…' }) as HTMLButtonElement).disabled).toBe(true));
    expect(input.disabled).toBe(true);
    release();
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Ripristina da file…' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
