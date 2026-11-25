import { useRef, useState, type FormEvent } from 'react';
import { ApiError, type LibraryOut } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import { useSession } from '../../session';
import { useT } from '../../app/i18n';
import { authenticate, deviceInfo, newRemoteConnection } from './connections';
import { apiErrors, hasErrors, probeErrors, type Errors } from './errors';
import { collect, emailError, focusFirstError, passwordError, requiredError } from './validate';
import { useBusy } from './useBusy';
import { useRemoteProbe } from './useRemoteProbe';
import type { Redirect } from './types';

export type JoinMode = 'code' | 'account';

interface Target {
  url: string;
  fingerprint: string | null;
}

interface Choice {
  target: Target;
  libraries: LibraryOut[];
}

const ORDER: Record<JoinMode, string[]> = {
  code: ['address', 'code'],
  account: ['address', 'email', 'password'],
};

/** "Unisciti": a library that already exists, by pairing code or by email and password. */
export function useJoin() {
  const t = useT();
  const platform = usePlatform();
  const signIn = useSession((s) => s.signIn);
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<JoinMode>('code');
  const [values, setValues] = useState({ address: '', code: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [redirect, setRedirect] = useState<Redirect | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const { busy, run } = useBusy();
  const remote = useRemoteProbe();

  const fail = (e: unknown) => setErrors(apiErrors(e, t));

  const login = async (target: Target, libraryId?: string) => {
    const device = await deviceInfo(platform);
    const email = values.email.trim();
    const { password } = values;
    await authenticate(platform, signIn, newRemoteConnection(target.url, target.fingerprint), async (client) => {
      const id = libraryId;
      if (!id) {
        const { libraries } = await client.libraries({ email, password });
        if (libraries.length > 1) {
          setChoice({ target, libraries });
          return null;
        }
        if (libraries.length === 0) throw new ApiError(401, 'invalid_credentials', 'no library');
      }
      return client.login({ email, password, ...device, ...(id ? { library_id: id } : {}) });
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setRedirect(null);
      const found = collect([
        ['address', requiredError(values.address, t)],
        ...(mode === 'code'
          ? ([['code', requiredError(values.code, t)]] as Array<[string, string | undefined]>)
          : ([
              ['email', emailError(values.email, t)],
              ['password', passwordError(values.password, t)],
            ] as Array<[string, string | undefined]>)),
      ]);
      setErrors(found);
      if (hasErrors(found)) return focusFirstError(formRef.current, ORDER[mode], found);

      const probed = await remote.probe(values.address);
      if (!probed.ok) return setErrors(probeErrors(probed.error, t));
      if (probed.setup.needs_setup) {
        return setRedirect({ text: t('welcome.join.needsSetup'), to: 'server', action: t('welcome.join.goServer') });
      }
      const target = { url: probed.url, fingerprint: probed.fingerprint };
      if (mode === 'account') return login(target);
      const device = await deviceInfo(platform);
      await authenticate(platform, signIn, newRemoteConnection(target.url, target.fingerprint), (client) =>
        client.redeemPairingCode({ code: values.code.trim(), ...device }),
      );
    }, fail);
  };

  const choose = (library: LibraryOut) => {
    if (!choice) return;
    void run(() => login(choice.target, library.id), fail);
  };

  return {
    formRef,
    mode,
    setMode: (m: JoinMode) => {
      setMode(m);
      setErrors({});
    },
    values,
    setValue: (key: keyof typeof values, v: string) => setValues((s) => ({ ...s, [key]: v })),
    errors,
    redirect,
    choice: choice?.libraries ?? null,
    leaveChoice: () => setChoice(null),
    busy,
    submit,
    choose,
    phrase: remote.phrase,
    confirmPhrase: remote.confirmPhrase,
    cancelPhrase: remote.cancelPhrase,
  };
}

export type JoinState = ReturnType<typeof useJoin>;
