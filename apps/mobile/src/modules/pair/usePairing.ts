import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { CodeInfo } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { useClient, useSession } from '../../session';
import { normalizeCode } from './normalize';

export const AFTER_PAIR = '/search';
const NAME_MAX = 80;
export const DISPLAY_NAME_MAX = 60;
export { NAME_MAX };

export interface Pairing {
  loading: boolean;
  error: string | null;
  /** Set once the code turned out to be an invitation: the page then asks for the person's name. */
  invite: CodeInfo | null;
  /** Inspects `rawCode`: a device code is redeemed at once, an invitation stops at `invite`. */
  submit(rawCode: string, rawName: string): Promise<void>;
  /** Redeems the invitation inspected by `submit`, with the person's own name. */
  join(rawDisplayName: string, deviceName: string): Promise<void>;
}

/** The pairing requests shared by the link page and the typed-code page. */
export function usePairing(): Pairing {
  const t = useT();
  const client = useClient();
  const signIn = useSession((s) => s.signIn);
  const navigate = useNavigate();
  const running = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; info: CodeInfo } | null>(null);

  const run = useCallback(
    async (work: () => Promise<boolean>) => {
      if (running.current) return;
      running.current = true;
      setLoading(true);
      setError(null);
      try {
        if (await work()) return; // signed in: the page is leaving
      } catch (e) {
        setError(
          apiErrorMessage(t, e, {
            pairing_code_invalid: t('mpair.errors.invalid'),
            network: t('mpair.errors.network'),
          }),
        );
      }
      running.current = false;
      setLoading(false);
    },
    [t],
  );

  const redeem = useCallback(
    async (body: Parameters<typeof client.redeemPairingCode>[0]) => {
      const auth = await client.redeemPairingCode(body);
      try {
        await signIn(auth);
      } catch (e) {
        // The device is registered: a hiccup while confirming the session must not keep the page.
        if (useSession.getState().status !== 'ready') throw e;
      }
      navigate(AFTER_PAIR, { replace: true });
      return true;
    },
    [client, navigate, signIn],
  );

  const submit = useCallback(
    async (rawCode: string, rawName: string) => {
      if (running.current) return;
      const code = normalizeCode(rawCode);
      const name = rawName.trim();
      if (!code) return setError(t('mpair.errors.codeEmpty'));
      await run(async () => {
        const info = await client.inspectPairingCode({ code });
        if (info.kind === 'invite') {
          setInvite({ code, info });
          return false;
        }
        if (!name) {
          setError(t('mpair.errors.nameEmpty'));
          return false;
        }
        return redeem({ code, device_name: name, device_kind: 'mobile' });
      });
    },
    [client, redeem, run, t],
  );

  const join = useCallback(
    async (rawDisplayName: string, deviceName: string) => {
      if (running.current || !invite) return;
      const display = rawDisplayName.trim();
      if (!display) return setError(t('mpair.errors.displayEmpty'));
      await run(() =>
        redeem({
          code: invite.code,
          device_name: deviceName.trim() || 'Bookeeper',
          device_kind: 'mobile',
          display_name: display,
        }),
      );
    },
    [invite, redeem, run, t],
  );

  return { loading, error, invite: invite?.info ?? null, submit, join };
}
