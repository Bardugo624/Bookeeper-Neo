import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@bookeeper/api';
import { useSession } from '../session';
import { fakeConnection, fakePlatform } from '../platform/testing';
import { KitWrapper } from './testing';
import { usePasswordConfirm, type ConfirmOutcome } from './usePasswordConfirm';

const needsConfirm = () => new ApiError(401, 'confirmation_required', 'x');

function setup(confirmStatus: 'ok' | 'wrong' = 'ok') {
  const platform = fakePlatform({
    handler: (r) =>
      r.path === '/api/v1/auth/confirm'
        ? confirmStatus === 'ok'
          ? { status: 200, body: { confirm_token: 'tok', expires_in: 60 } }
          : { status: 401, body: { error_code: 'invalid_credentials', message: 'x' } }
        : { status: 404, body: { error_code: 'not_found', message: 'x' } },
  });
  // The authenticated transport needs an active connection.
  useSession.setState({ connection: fakeConnection() });
  let api!: ReturnType<typeof usePasswordConfirm>;
  function Probe() {
    api = usePasswordConfirm();
    return <>{api.dialog}</>;
  }
  const wrap = ({ children }: { children: ReactNode }) => (
    <KitWrapper platform={platform}>{children}</KitWrapper>
  );
  render(<Probe />, { wrapper: wrap });
  return { platform, run: <T,>(a: (t?: string) => Promise<T>) => api.run(a) };
}

describe('usePasswordConfirm', () => {
  it('returns the value of an action that succeeds at once', async () => {
    const { run } = setup();
    const action = vi.fn().mockResolvedValue(7);
    await expect(run(action)).resolves.toEqual({ cancelled: false, value: 7 });
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for the password and repeats the action once with the token', async () => {
    const { run, platform } = setup();
    const action = vi.fn().mockRejectedValueOnce(needsConfirm()).mockResolvedValueOnce('done');
    let result!: Promise<ConfirmOutcome<string>>;
    act(() => {
      result = run(action);
    });
    await userEvent.type(await screen.findByLabelText('Password'), 'segreto');
    await userEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    await expect(result).resolves.toEqual({ cancelled: false, value: 'done' });
    expect(action).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenLastCalledWith('tok');
    expect(platform.calls.find((c) => c.path === '/api/v1/auth/confirm')?.body).toEqual({ password: 'segreto' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows an error and stays open on a wrong password', async () => {
    const { run } = setup('wrong');
    const action = vi.fn().mockRejectedValue(needsConfirm());
    act(() => {
      void run(action);
    });
    await userEvent.type(await screen.findByLabelText('Password'), 'no');
    await userEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(await screen.findByText('La password non è corretta.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('resolves cancelled when the dialog is cancelled', async () => {
    const { run } = setup();
    let result!: Promise<ConfirmOutcome<void>>;
    act(() => {
      result = run(() => Promise.reject(needsConfirm()));
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await expect(result).resolves.toEqual({ cancelled: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('rejects with other errors', async () => {
    const { run } = setup();
    await expect(run(() => Promise.reject(new ApiError(500, 'internal', 'x')))).rejects.toMatchObject({ code: 'internal' });
  });
});
