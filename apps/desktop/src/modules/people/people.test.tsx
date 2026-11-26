import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useSession } from '../../session';
import { invite, library, person, renderPeople } from './testkit';

const others = () => [
  person('u2', 'Bruno', 'admin', { devices: 2, email: 'bruno@example.org', last_seen: Math.floor(Date.now() / 1000) }),
  person('u3', 'Carla', 'member', { devices: 0 }),
  person('u4', 'Dario', 'guest'),
];

const open = async (name: string) => userEvent.click(await screen.findByRole('button', { name: `Azioni per ${name}` }));
const menuNames = async () => (await screen.findAllByRole('menuitem')).map((i) => i.textContent);

describe('list', () => {
  it('shows the people in the server order, marks the caller and shows the email only when present', async () => {
    renderPeople(library('owner', others()));
    const items = await screen.findAllByRole('heading', { level: 3 });
    expect(items.map((h) => h.textContent)).toEqual(['Anna', 'Bruno', 'Carla', 'Dario']);
    expect(screen.getByText('4 persone')).toBeInTheDocument();
    expect(screen.getAllByText('Tu')).toHaveLength(1);
    const anna = screen.getByRole('heading', { name: 'Anna' }).closest('li')!;
    expect(within(anna).getByText('Tu')).toBeInTheDocument();
    expect(within(anna).getByText('Proprietario')).toBeInTheDocument();
    const bruno = screen.getByRole('heading', { name: 'Bruno' }).closest('li')!;
    expect(within(bruno).getByText('bruno@example.org')).toBeInTheDocument();
    expect(within(bruno).getByText('2 dispositivi')).toBeInTheDocument();
    expect(within(bruno).getByText('Ultimo accesso: oggi')).toBeInTheDocument();
    expect(within(bruno).getByText('Admin')).toBeInTheDocument();
    const carla = screen.getByRole('heading', { name: 'Carla' }).closest('li')!;
    expect(within(carla).queryByText(/@/)).not.toBeInTheDocument();
    expect(within(carla).getByText('Mai entrato')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    renderPeople({ ...library('member', others()), listFails: true });
    expect(await screen.findByText('Qualcosa non ha funzionato')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });

  it('is in the sidebar for every role', async () => {
    renderPeople(library('guest', others()));
    expect(await screen.findByRole('link', { name: 'Persone' })).toBeInTheDocument();
  });
});

describe('menu by role', () => {
  it('gives a guest and a member only their own row, with rename and leave', async () => {
    for (const role of ['guest', 'member'] as const) {
      const { unmount } = renderPeople(library(role, [person('u0', 'Zeno', 'owner'), ...others()]));
      await screen.findByText('Zeno');
      expect(screen.getAllByRole('button', { name: /^Azioni per/ })).toHaveLength(1);
      await open('Anna');
      expect(await menuNames()).toEqual(['Rinomina', 'Esci dalla libreria']);
      unmount();
    }
  });

  it('lets an admin manage members and guests but not an admin or the owner', async () => {
    renderPeople(library('admin', [person('u0', 'Zeno', 'owner'), ...others()]));
    await screen.findByText('Zeno');
    const buttons = screen.getAllByRole('button', { name: /^Azioni per/ }).map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Azioni per Anna', 'Azioni per Carla', 'Azioni per Dario']);
    await open('Carla');
    expect(await menuNames()).toEqual(['Cambia ruolo', 'Rinomina', 'Rimuovi']);
  });

  it('lets the owner manage everybody else, without leaving', async () => {
    renderPeople(library('owner', others()));
    await screen.findByText('Bruno');
    await open('Anna');
    expect(await menuNames()).toEqual(['Rinomina']);
    await userEvent.keyboard('{Escape}');
    await open('Bruno');
    expect(await menuNames()).toEqual(['Cambia ruolo', 'Rinomina', 'Rendi proprietario', 'Rimuovi']);
    const separator = screen.getByRole('separator');
    const remove = screen.getByRole('menuitem', { name: 'Rimuovi' });
    expect(separator.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives an admin the invite button and a member none', async () => {
    const admin = renderPeople(library('admin', others()));
    expect(await screen.findByRole('button', { name: 'Invita una persona' })).toBeInTheDocument();
    admin.unmount();
    renderPeople(library('member', others()));
    await screen.findByText('Bruno');
    expect(screen.queryByRole('button', { name: 'Invita una persona' })).not.toBeInTheDocument();
    expect(screen.queryByText('Inviti in attesa')).not.toBeInTheDocument();
  });
});

describe('writes', () => {
  it('changes a role with only the roles the owner can give', async () => {
    const { platform } = renderPeople(library('owner', others()));
    await open('Carla');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }));
    expect(screen.getAllByRole('radio').map((r) => r.nextSibling?.textContent)).toEqual(['Admin', 'Membro', 'Ospite']);
    expect(screen.getByRole('radio', { name: 'Membro' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Ospite' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(platform.calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/api/v1/users/u3', body: { role: 'guest' } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers an admin only member and guest', async () => {
    renderPeople(library('admin', others()));
    await open('Carla');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }));
    expect(screen.getAllByRole('radio').map((r) => r.nextSibling?.textContent)).toEqual(['Membro', 'Ospite']);
  });

  it('shows the error of a refused change and keeps the dialog', async () => {
    const world = { ...library('admin', others()), fails: { method: 'PATCH', pattern: /users/, status: 403, code: 'forbidden' } };
    renderPeople(world);
    await open('Carla');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Ospite' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Non hai i permessi per eseguire questa operazione.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renames with the trimmed name and validates it', async () => {
    const { platform } = renderPeople(library('owner', others()));
    await open('Carla');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rinomina' }));
    const input = screen.getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Scrivi un nome.')).toBeInTheDocument();
    await userEvent.type(input, '  Carlotta ');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByRole('heading', { name: 'Carlotta' })).toBeInTheDocument();
    expect(platform.calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/api/v1/users/u3', body: { display_name: 'Carlotta' } });
  });

  it('renaming yourself refreshes me', async () => {
    renderPeople(library('owner', others()));
    await open('Anna');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rinomina' }));
    const input = screen.getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Annalisa');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(useSession.getState().me?.user.display_name).toBe('Annalisa'));
  });

  it('lists what removing does, then removes', async () => {
    const { platform } = renderPeople(library('owner', others()));
    await open('Dario');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rimuovi' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('I suoi dispositivi vengono scollegati.')).toBeInTheDocument();
    expect(within(dialog).getByText(/stato di lettura e la sua lista dei desideri vengono cancellati/)).toBeInTheDocument();
    expect(within(dialog).getByText('I libri e i prestiti restano dove sono.')).toBeInTheDocument();
    expect(platform.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rimuovi' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dario' })).not.toBeInTheDocument());
    expect(platform.calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/v1/users/u4');
  });

  it('shows the error when a removal fails', async () => {
    renderPeople({ ...library('owner', others()), fails: { method: 'DELETE', pattern: /users/, status: 404, code: 'not_found' } });
    await open('Dario');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rimuovi' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rimuovi' }));
    expect(await screen.findByText("L'elemento non esiste più.")).toBeInTheDocument();
  });

  it('leaves the library: removes the caller and ends the session', async () => {
    const { platform } = renderPeople(library('member', [person('u0', 'Zeno', 'owner')]));
    await open('Anna');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Esci dalla libreria' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Esci dalla libreria' }));
    await waitFor(() => expect(useSession.getState().status).toBe('welcome'));
    expect(platform.calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/v1/users/u1');
    expect(platform.calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(true);
  });

  it('hands the library over: names the person on the button, then reloads me', async () => {
    const { platform } = renderPeople(library('owner', others()));
    await screen.findByText('Bruno');
    expect(useSession.getState().me?.user.role).toBe('owner');
    await open('Bruno');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rendi proprietario' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Tu diventi Admin.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rendi Bruno proprietario' }));
    await waitFor(() => expect(useSession.getState().me?.user.role).toBe('admin'));
    expect(platform.calls.find((c) => c.path === '/api/v1/users/u2/owner')?.method).toBe('POST');
    // The caller is now an admin: nobody has "Rendi proprietario" any more and Bruno is the owner.
    const bruno = (await screen.findByRole('heading', { name: 'Bruno' })).closest('li')!;
    await waitFor(() => expect(within(bruno).getByText('Proprietario')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Azioni per Bruno' })).not.toBeInTheDocument();
  });
});

describe('invitations', () => {
  it('offers the owner Admin, Membro and Ospite, with Membro and 7 days preselected', async () => {
    renderPeople(library('owner', others()));
    await userEvent.click(await screen.findByRole('button', { name: 'Invita una persona' }));
    const roles = within(screen.getByRole('group', { name: 'Ruolo' }));
    expect(roles.getAllByRole('radio').map((r) => r.nextSibling?.textContent)).toEqual(['Admin', 'Membro', 'Ospite']);
    expect(roles.getByRole('radio', { name: 'Membro' })).toBeChecked();
    const days = within(screen.getByRole('group', { name: 'Validità' }));
    expect(days.getAllByRole('radio').map((r) => r.nextSibling?.textContent)).toEqual(['1 giorno', '7 giorni', '30 giorni']);
    expect(days.getByRole('radio', { name: '7 giorni' })).toBeChecked();
  });

  it('offers an admin only Membro and Ospite', async () => {
    renderPeople(library('admin', others()));
    await userEvent.click(await screen.findByRole('button', { name: 'Invita una persona' }));
    expect(screen.queryByRole('radio', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /Membro|Ospite/ })).toHaveLength(2);
  });

  it('creates the invitation and shows the code, without a QR when the server has no HTTPS address', async () => {
    const { platform } = renderPeople(library('owner', others()));
    await userEvent.click(await screen.findByRole('button', { name: 'Invita una persona' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Ospite' }));
    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crea l’invito' }));
    expect(await screen.findByText('ABCD 2345')).toBeInTheDocument();
    expect(platform.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/invites')?.body).toEqual({ role: 'guest', expires_in_days: 30 });
    expect(screen.getByText('Sul computer: Unisciti, poi il codice. Per entrare dal telefono serve un server con un indirizzo HTTPS.')).toBeInTheDocument();
    expect(screen.getByText(/^Scade il /)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('adds the QR for the phone when the server has a public HTTPS address', async () => {
    renderPeople({ ...library('owner', others()), server: { phone_ready: true, public_url: 'https://libreria.example.org' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Invita una persona' }));
    await screen.findByRole('radio', { name: 'Membro' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crea l’invito' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Crea l’invito' }));
    expect(await screen.findByRole('img', { name: 'Codice QR per unirsi dal telefono' })).toBeInTheDocument();
    expect(screen.getByText('https://libreria.example.org')).toBeInTheDocument();
  });

  it('shows the error when the invitation cannot be created', async () => {
    renderPeople({ ...library('admin', others()), fails: { method: 'POST', pattern: /invites/, status: 403, code: 'forbidden' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Invita una persona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crea l’invito' }));
    expect(await screen.findByText('Non hai i permessi per eseguire questa operazione.')).toBeInTheDocument();
  });

  it('lists the pending invitations and revokes one', async () => {
    const world = { ...library('owner', others()), invites: [invite('i1', 'member'), invite('i2', 'guest', { created_by: { id: 'u2', display_name: 'Bruno' } })] };
    const { platform } = renderPeople(world);
    expect(await screen.findByText('Inviti in attesa')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: /^Revoca/ }));
    expect(items).toHaveLength(2);
    expect(within(items[1]!).getByText('Ospite')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/Creato da Bruno/)).toBeInTheDocument();
    await userEvent.click(within(items[0]!).getByRole('button', { name: /^Revoca l’invito per un Membro, scade il /  }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Revoca/ })).toHaveLength(1));
    expect(platform.calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/v1/invites/i1');
  });

  it('says so, with a retry, when the pending invitations cannot be loaded', async () => {
    renderPeople({ ...library('owner', others()), fails: { method: 'GET', pattern: /invites/, status: 500, code: 'internal' } });
    expect(await screen.findByText(/Non riesco a leggere gli inviti in attesa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });
});
