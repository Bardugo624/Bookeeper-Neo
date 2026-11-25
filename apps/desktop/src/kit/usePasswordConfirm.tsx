import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@bookeeper/api';
import { useT } from '../app/i18n';
import { usePlatform } from '../platform';
import { createAuthTransport } from '../session';
import { apiErrorMessage } from './apiErrorMessage';
import { PasswordDialog } from './PasswordDialog';

export type ConfirmOutcome<T> = { cancelled: false; value: T } | { cancelled: true };

/** The action gets the confirm token on the repeat (send it as `X-Confirm-Token`). */
export type ConfirmableAction<T> = (confirmToken?: string) => Promise<T>;

interface Pending {
  action: ConfirmableAction<unknown>;
  resolve(outcome: ConfirmOutcome<unknown>): void;
  reject(error: unknown): void;
}

function isConfirmationRequired(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'confirmation_required';
}

/**
 * Runs an action; when the core answers `confirmation_required`, asks for the password, exchanges it
 * at `POST /auth/confirm` and repeats the action once with the confirm token.
 */
export function usePasswordConfirm(): {
  run<T>(action: ConfirmableAction<T>): Promise<ConfirmOutcome<T>>;
  dialog: ReactNode;
} {
  const t = useT();
  const platform = usePlatform();
  const pending = useRef<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    pending.current = null;
    setOpen(false);
    setBusy(false);
    setError(null);
  }, []);

  const run = useCallback(
    async <T,>(action: ConfirmableAction<T>): Promise<ConfirmOutcome<T>> => {
      try {
        return { cancelled: false, value: await action() };
      } catch (e) {
        if (!isConfirmationRequired(e)) throw e;
      }
      return new Promise<ConfirmOutcome<T>>((resolve, reject) => {
        pending.current = { action, resolve: resolve as Pending['resolve'], reject };
        setError(null);
        setOpen(true);
      });
    },
    [],
  );

  const submit = useCallback(
    async (password: string) => {
      const current = pending.current;
      if (!current) return;
      setBusy(true);
      setError(null);
      let token: string;
      try {
        const res = await createAuthTransport(platform).request('POST', '/api/v1/auth/confirm', { password });
        const body = res.body as { confirm_token?: unknown; error_code?: unknown; message?: unknown } | null;
        if (res.status !== 200 || typeof body?.confirm_token !== 'string') {
          const code = typeof body?.error_code === 'string' ? body.error_code : 'unknown';
          throw new ApiError(res.status, code, String(body?.message ?? ''), res.retryAfter);
        }
        token = body.confirm_token;
      } catch (e) {
        setBusy(false);
        setError(apiErrorMessage(t, e, { invalid_credentials: t('common.password.wrong') }));
        return;
      }
      try {
        current.resolve({ cancelled: false, value: await current.action(token) });
      } catch (e) {
        current.reject(e);
      }
      close();
    },
    [platform, t, close],
  );

  const cancel = useCallback(() => {
    pending.current?.resolve({ cancelled: true });
    close();
  }, [close]);

  const dialog = open ? <PasswordDialog open busy={busy} error={error} onSubmit={(p) => void submit(p)} onCancel={cancel} /> : null;
  return { run, dialog };
}
