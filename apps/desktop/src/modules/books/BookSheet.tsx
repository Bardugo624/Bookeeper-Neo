import { useEffect, useRef, useState, type Ref } from 'react';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { TagPicker } from '../tags';
import { CollectionFields, EditionFields, EssentialsFields, NotesFields } from './BookFormFields';
import { CoverPicker } from './CoverPicker';
import { FieldGroup } from './FieldGroup';
import { ExistingNotice, LookupNotice } from './LookupNotice';
import { authorsOf } from './format';
import { GROUP_IDS, filledCount, groupOf, groupsWithValues, type GroupId, type OpenGroups } from './bookFormGroups';
import type { UseBookEditor } from './useBookEditor';
import type { CoverStatus } from './useCover';
import styles from './BookSheet.module.css';

export interface BookSheetProps {
  id: string;
  editor: UseBookEditor;
  storedSrc?: string;
  storedStatus: CoverStatus;
  /** Editing a stored book (not creating one). */
  editing: boolean;
  /** The wrapper of the cover preview, for the flight of a new book. */
  coverRef?: Ref<HTMLDivElement>;
}

const GROUP_FIELD_COMPONENT = { edition: EditionFields, collection: CollectionFields, notes: NotesFields } as const;

/** Opens the groups the form already has values in; a validation error in a folded group opens it and takes the focus. */
function useOpenGroups(editor: UseBookEditor, editing: boolean) {
  const { form } = editor;
  const [open, setOpen] = useState<OpenGroups>(() => groupsWithValues(form.values, editing ? [] : ['progressive']));
  const pending = useRef<string | null>(null);
  const submitted = useRef(false);
  const wanted = (Object.keys(form.values) as Array<keyof typeof form.values>).filter((key) => form.errors[key]);
  const hidden = wanted.filter((key) => {
    const group = groupOf(key);
    return group !== undefined && !open[group];
  });
  const first = wanted[0];
  useEffect(() => {
    // Only a submit opens a group and moves the focus; clearing an error while typing does not.
    // The flag lasts until the person types again, since a server error (a clash) arrives after the submit.
    if (!submitted.current || hidden.length === 0) return;
    // The first invalid field is the one that takes the focus, once its group has rendered.
    if (first !== undefined && hidden.includes(first)) pending.current = first;
    setOpen((prev) => {
      const next = { ...prev };
      for (const key of hidden) next[groupOf(key)!] = true;
      return next;
    });
    // Runs when the errors change (a submit), not when the user folds a group that still has one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.errors]);
  useEffect(() => {
    if (!pending.current) return;
    document.querySelector<HTMLElement>(`[name="${CSS.escape(pending.current)}"]`)?.focus();
    pending.current = null;
  }, [open]);
  return { open, onSubmit: () => void (submitted.current = true),
    onTyping: () => void (submitted.current = false), toggle: (group: GroupId, next: boolean) => setOpen((prev) => ({ ...prev, [group]: next })) };
}

/** The book as a card: cover on the left, the essentials on the right, tags, then rows that open. */
export function BookSheet({ id, editor, storedSrc, storedStatus, editing, coverRef }: BookSheetProps) {
  const t = useT();
  const { form } = editor;
  const { open, toggle, onSubmit, onTyping } = useOpenGroups(editor, editing);
  return (
    <form id={id} className={styles.sheet} onSubmitCapture={onSubmit} onInputCapture={onTyping} onSubmit={editor.save(false)} noValidate>
      <div className={styles.top}>
        <div className={styles.cover}>
          <CoverPicker
            title={form.values.title}
            author={authorsOf(form.values) || undefined}
            storedSrc={storedSrc}
            previewRef={coverRef}
            storedStatus={storedStatus}
            candidates={editor.candidates}
            plan={editor.plan}
            onPlan={editor.setPlan}
            color={editor.color}
            onColor={editor.setColor}
          />
        </div>
        <div className={styles.essentials}>
          {form.submitError ? (
            <p role="alert" className={styles.error}>
              {apiErrorMessage(t, form.submitError)}
            </p>
          ) : null}
          <LookupNotice outcome={editor.outcome} />
          <ExistingNotice existing={editor.duplicate} />
          <EssentialsFields form={form} />
        </div>
      </div>
      <TagPicker value={editor.tagIds} onChange={editor.setTagIds} disabled={editor.saving} />
      <div className={styles.groups}>
        {GROUP_IDS.map((group) => {
          const Fields = GROUP_FIELD_COMPONENT[group];
          return (
            <FieldGroup
              key={group}
              label={t(`books.form.groups.${group}`)}
              open={open[group]}
              onToggle={(next) => toggle(group, next)}
              count={filledCount(form.values, group)}
            >
              <Fields form={form} />
            </FieldGroup>
          );
        })}
      </div>
    </form>
  );
}
