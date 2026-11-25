import { useSession } from '../../session';

/** Who is signed in, to which library, and the way out. Components never read the store directly. */
export function useSettingsSession() {
  const me = useSession((s) => s.me);
  const connection = useSession((s) => s.connection);
  const signOut = useSession((s) => s.signOut);
  return { me, connection, signOut: () => void signOut() };
}
