import { useState } from 'react';
import { ApiError, type TagOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { DEFAULT_COLOR, MAX_TAGS_PER_BOOK, NAME_MAX, sameName, type TagColor } from './tagModel';
import { useTags, useTagWrites } from './useTags';

export type PickerOption = { kind: 'tag'; tag: TagOut; selected: boolean; disabled: boolean } | { kind: 'create'; name: string; disabled: boolean };

/** State of the multiple-choice combobox: search, keyboard, creation on the fly. */
export function useTagPicker(value: string[], onChange: (next: string[]) => void) {
  const t = useT();
  const tags = useTags();
  const { create } = useTagWrites();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [color, setColor] = useState<TagColor>(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);

  const all = tags.data ?? [];
  const query = text.trim();
  const full = value.length >= MAX_TAGS_PER_BOOK;
  const needle = query.toLowerCase();
  const options: PickerOption[] = all
    .filter((tag) => tag.name.toLowerCase().includes(needle))
    .map((tag) => {
      const selected = value.includes(tag.id);
      return { kind: 'tag', tag, selected, disabled: !selected && full };
    });
  const canCreate = query !== '' && !all.some((tag) => sameName(tag.name, query));
  if (canCreate) options.push({ kind: 'create', name: query, disabled: full || query.length > NAME_MAX });
  const selected = value.flatMap((id) => all.find((tag) => tag.id === id) ?? []);

  const edit = (next: string) => {
    setText(next);
    setActive(0);
    setOpen(true);
    setError(null);
  };

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const createTag = async (name: string) => {
    if (create.isPending) return;
    setError(null);
    try {
      const made = await create.mutateAsync({ name, color });
      onChange([...value, made.id]);
      setText('');
      setColor(DEFAULT_COLOR);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'tag_exists'
          ? t('tags.errors.exists')
          : apiErrorMessage(t, e),
      );
    }
  };

  const choose = (option: PickerOption | undefined) => {
    if (!option || option.disabled) return;
    if (option.kind === 'create') void createTag(option.name);
    else {
      toggle(option.tag.id);
      setText('');
    }
  };

  const onKeyDown = (key: string): boolean => {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (!open) setOpen(true);
      else if (options.length > 0) setActive((i) => (i + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      return true;
    }
    if (key === 'Enter') {
      choose(options[active]);
      return true;
    }
    if (key === 'Escape' && open) {
      setOpen(false);
      return true;
    }
    if (key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1));
      return true;
    }
    return false;
  };

  return {
    text, edit, open, setOpen, active, setActive, color, setColor, error, options, selected, full,
    loading: tags.isPending, failed: tags.isError, creating: create.isPending, canCreate,
    choose, toggle, onKeyDown,
  };
}
