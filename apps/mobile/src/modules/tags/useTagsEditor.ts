import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { leastUsedColor, sameName } from './tagModel';
import { useCreateTag, useSetBookTags, useTags } from './useTags';

/** The choices made in the sheet: nothing is sent until `save`, which sends the final set once. */
export function useTagsEditor(book: BookOut, onSaved: () => void) {
  const t = useT();
  const tags = useTags();
  const create = useCreateTag();
  const set = useSetBookTags(book.id);
  const [selected, setSelected] = useState<string[]>(() => (book.tags ?? []).map((tag) => tag.id));
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = tags.data ?? [];
  const needle = filter.trim().toLowerCase();
  const shown = needle ? all.filter((tag) => tag.name.toLowerCase().includes(needle)) : all;
  const canCreate = tags.isSuccess && needle !== '' && !all.some((tag) => sameName(tag.name, filter));
  const busy = create.isPending || set.isPending;

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const add = async () => {
    if (busy) return;
    setError(null);
    try {
      const made = await create.mutateAsync({ name: filter.trim(), color: leastUsedColor(all) });
      setSelected((cur) => [...cur, made.id]);
      setFilter('');
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  const save = async () => {
    if (busy) return;
    setError(null);
    try {
      await set.mutateAsync(selected);
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  return { tags, shown, selected, toggle, filter, setFilter, canCreate, add, save, busy, error };
}
