import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PersonOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { usePeopleList } from '../people';
import { sameName } from './history';

export const SUGGEST_DELAY_MS = 200;

export interface BorrowerSuggestions {
  people: PersonOut[];
  names: string[];
}

/**
 * People of the library that match the text (all of them when it is empty), then the names already used for
 * a loan that start with it. A name that is also a proposed person is not repeated.
 * `meLabel` is how the caller is called ("Tu"): it matches as well as the server name.
 */
export function useBorrowerSuggestions(text: string, enabled: boolean, meLabel: string): BorrowerSuggestions {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const everyone = usePeopleList(enabled);
  const [q, setQ] = useState(text.trim());
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), SUGGEST_DELAY_MS);
    return () => clearTimeout(id);
  }, [text]);
  const query = useQuery({
    queryKey: ['loans', connectionId, 'borrowers', q],
    enabled,
    retry: false,
    queryFn: () => client.listBorrowers(q || undefined),
  });
  // While the typed text is still waiting out the delay, the old results would not match it.
  if (q !== text.trim()) return { people: [], names: [] };
  const needle = sameName(q);
  const people = everyone.filter(
    (p) => needle === '' || sameName(p.display_name).includes(needle) || (p.is_me && sameName(meLabel).includes(needle)),
  );
  const taken = new Set(people.map((p) => sameName(p.display_name)));
  const names = (query.data?.items ?? []).filter((n) => !taken.has(sameName(n)));
  return { people, names };
}
