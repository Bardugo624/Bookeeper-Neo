import { useRef, useState, type FormEvent } from 'react';
import { usePlatform } from '../../platform';
import { useSession } from '../../session';
import { useT } from '../../app/i18n';
import { authenticate, deviceInfo, findLocal, newLocalConnection, reopenLocal } from './connections';
import { apiErrors, hasErrors, type Errors } from './errors';
import { collect, focusFirstError, nameError } from './validate';
import { useBusy } from './useBusy';
import { useLocalLibrary } from './useLocalLibrary';

const ORDER = ['libraryName', 'displayName'];

/** "Crea qui": a library on this computer, or the one that is already there. */
export function useCreateLocal() {
  const t = useT();
  const platform = usePlatform();
  const signIn = useSession((s) => s.signIn);
  const init = useSession((s) => s.init);
  const local = useLocalLibrary();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ libraryName: '', displayName: '' });
  const [errors, setErrors] = useState<Errors>({});
  const { busy, run } = useBusy();

  const fail = (e: unknown) => setErrors(apiErrors(e, t));

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const found = collect([
        ['libraryName', nameError(values.libraryName, t)],
        ['displayName', nameError(values.displayName, t)],
      ]);
      setErrors(found);
      if (hasErrors(found)) return focusFirstError(formRef.current, ORDER, found);
      // The check may still be creating (and then removing) its temporary connection.
      await local.settled();
      const device = await deviceInfo(platform);
      const connection = (await findLocal(platform)) ?? newLocalConnection();
      await authenticate(platform, signIn, connection, (client) =>
        client.setup({
          library_name: values.libraryName.trim(),
          display_name: values.displayName.trim(),
          ...device,
        }),
      );
    }, fail);
  };

  const open = () =>
    void run(async () => {
      setErrors({});
      try {
        await reopenLocal(platform, await findLocal(platform));
      } catch {
        setErrors({ form: t('welcome.local.openFailed') });
        return;
      }
      await init(platform);
    }, fail);

  return {
    state: local.state,
    checking: local.state === 'checking',
    formRef,
    values,
    setValue: (key: keyof typeof values, v: string) => setValues((s) => ({ ...s, [key]: v })),
    errors,
    busy,
    create,
    open,
  };
}
