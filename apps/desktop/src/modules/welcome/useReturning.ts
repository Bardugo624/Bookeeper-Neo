import { useMemo, useRef, useState, type FormEvent } from 'react';
import { usePlatform, type Connection } from '../../platform';
import { useSession } from '../../session';
import { useT } from '../../app/i18n';
import { authenticate, deviceInfo, forgetLogin, lastLogin, reopenLocal } from './connections';
import { apiErrors, hasErrors, type Errors } from './errors';
import { collect, emailError, focusFirstError, passwordError } from './validate';
import { useBusy } from './useBusy';

/** "Bentornato": the saved connection, whose session has expired. */
export function useReturning(connection: Connection) {
  const t = useT();
  const platform = usePlatform();
  const signIn = useSession((s) => s.signIn);
  const init = useSession((s) => s.init);
  const forget = useSession((s) => s.forget);
  const formRef = useRef<HTMLFormElement>(null);
  const last = useMemo(() => lastLogin(connection.id), [connection.id]);
  const [email, setEmail] = useState(last.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const { busy, run } = useBusy();

  // A local library made by "Crea qui" has no password: opening it is enough.
  const passwordless = connection.kind === 'local' && last.email === null;
  const askEmail = !passwordless && last.email === null;
  const fail = (e: unknown) => setErrors(apiErrors(e, t));

  const open = () =>
    void run(async () => {
      setErrors({});
      try {
        await reopenLocal(platform, connection);
      } catch {
        setErrors({ form: t('welcome.back.openFailed') });
        return;
      }
      await init(platform);
    }, fail);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const order = askEmail ? ['email', 'password'] : ['password'];
      const found = collect([
        ...(askEmail ? ([['email', emailError(email, t)]] as Array<[string, string | undefined]>) : []),
        ['password', passwordError(password, t)],
      ]);
      setErrors(found);
      if (hasErrors(found)) return focusFirstError(formRef.current, order, found);
      const device = await deviceInfo(platform);
      await authenticate(platform, signIn, connection, (client) =>
        client.login({
          email: email.trim(),
          password,
          ...device,
          ...(last.libraryId ? { library_id: last.libraryId } : {}),
        }),
      );
    }, fail);
  };

  const confirmForget = () =>
    void run(async () => {
      await forget(connection.id);
      forgetLogin(connection.id);
    }, fail);

  return {
    formRef,
    passwordless,
    askEmail,
    email,
    setEmail,
    password,
    setPassword,
    errors,
    busy,
    open,
    submit,
    confirming,
    askForget: () => setConfirming(true),
    closeForget: () => setConfirming(false),
    confirmForget,
  };
}
