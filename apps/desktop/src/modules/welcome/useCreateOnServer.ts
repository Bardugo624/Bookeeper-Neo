import { useRef, useState, type FormEvent } from 'react';
import { usePlatform } from '../../platform';
import { useSession } from '../../session';
import { useT } from '../../app/i18n';
import { authenticate, deviceInfo, newRemoteConnection } from './connections';
import { apiErrors, hasErrors, probeErrors, type Errors } from './errors';
import { collect, emailError, focusFirstError, nameError, passwordError, requiredError } from './validate';
import { useBusy } from './useBusy';
import { useRemoteProbe } from './useRemoteProbe';
import type { Redirect } from './types';

const ORDER = ['address', 'setupCode', 'libraryName', 'displayName', 'email', 'password'];

/** "Crea su un server": the first library of a server that is waiting for one. */
export function useCreateOnServer() {
  const t = useT();
  const platform = usePlatform();
  const signIn = useSession((s) => s.signIn);
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({
    address: '',
    setupCode: '',
    libraryName: '',
    displayName: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [redirect, setRedirect] = useState<Redirect | null>(null);
  const { busy, run } = useBusy();
  const remote = useRemoteProbe();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(
      async () => {
        setRedirect(null);
        const found = collect([
          ['address', requiredError(values.address, t)],
          ['setupCode', requiredError(values.setupCode, t)],
          ['libraryName', nameError(values.libraryName, t)],
          ['displayName', nameError(values.displayName, t)],
          ['email', emailError(values.email, t)],
          ['password', passwordError(values.password, t)],
        ]);
        setErrors(found);
        if (hasErrors(found)) return focusFirstError(formRef.current, ORDER, found);

        const probed = await remote.probe(values.address);
        if (!probed.ok) return setErrors(probeErrors(probed.error, t));
        if (!probed.setup.needs_setup) {
          return setRedirect({ text: t('welcome.server.alreadySet'), to: 'join', action: t('welcome.server.goJoin') });
        }
        const device = await deviceInfo(platform);
        await authenticate(platform, signIn, newRemoteConnection(probed.url, probed.fingerprint), (client) =>
          client.setup({
            setup_code: values.setupCode.trim(),
            library_name: values.libraryName.trim(),
            display_name: values.displayName.trim(),
            email: values.email.trim(),
            password: values.password,
            ...device,
          }),
        );
      },
      (e) => setErrors(apiErrors(e, t)),
    );
  };

  return {
    formRef,
    values,
    setValue: (key: keyof typeof values, v: string) => setValues((s) => ({ ...s, [key]: v })),
    errors,
    redirect,
    busy,
    submit,
    phrase: remote.phrase,
    confirmPhrase: remote.confirmPhrase,
    cancelPhrase: remote.cancelPhrase,
  };
}
