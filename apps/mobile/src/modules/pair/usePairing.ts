import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { useClient, useSession } from '../../session';
import { normalizeCode } from './normalize';

export const AFTER_PAIR = '/search';
const NAME_MAX = 80;
export { NAME_MAX };

export interface Pairing {
  loading: boolean;
  error: string | null;
  /** Redeems `rawCode`; a second call while one is running does nothing. */
  submit(rawCode: string, rawName: string): Promise<void>;
}

/** The redeem request shared by the link page and the typed-code page. */
export function usePairing(): Pairing {
  const t = useT();
  const client = useClient();
  const signIn = useSession((s) => s.signIn);
  const navigate = useNavigate();
  const running = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (rawCode: string, rawName: string) => {
      if (running.current) return;
      const code = normalizeCode(rawCode);
      const name = rawName.trim();
      if (!code) return setError(t('mpair.errors.codeEmpty'));
      if (!name) return setError(t('mpair.errors.nameEmpty'));
      running.current = true;
      setLoading(true);
      setError(null);
      try {
        const auth = await client.redeemPairingCode({ code, device_name: name, device_kind: 'mobile' });
        try {
          await signIn(auth);
        } catch (e) {
          // The device is registered: a hiccup while confirming the session must not keep the page.
          if (useSession.getState().status !== 'ready') throw e;
        }
        navigate(AFTER_PAIR, { replace: true });
      } catch (e) {
        setError(
          apiErrorMessage(t, e, {
            pairing_code_invalid: t('mpair.errors.invalid'),
            network: t('mpair.errors.network'),
          }),
        );
        running.current = false;
        setLoading(false);
      }
    },
    [client, navigate, signIn, t],
  );

  return { loading, error, submit };
}
