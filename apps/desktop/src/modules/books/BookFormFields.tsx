import { Field, Input, Textarea } from '@bookeeper/ui/base';
import { Select } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import type { FormState } from '../../kit';
import { AuthorsField } from './AuthorsField';
import { OwnerField } from './OwnerField';
import { FORMATS, type BookFormValues } from './bookFormModel';
import styles from './BookForm.module.css';

type Form = FormState<BookFormValues>;
type TextKey = Exclude<keyof BookFormValues, 'authors'>;

function useTextField(form: Form) {
  const t = useT();
  return (name: TextKey, extra: { type?: string; inputMode?: 'numeric' | 'decimal'; hint?: string; autoFocus?: boolean } = {}) => (
    <Field label={t(`books.form.${name}`)} error={form.errors[name]} description={extra.hint}>
      <Input
        name={name}
        type={extra.type}
        autoFocus={extra.autoFocus}
        inputMode={extra.inputMode}
        value={form.values[name]}
        onChange={(e) => form.setValue(name, e.target.value)}
      />
    </Field>
  );
}

/** Title, subtitle, authors, publisher, year: what every book has. Takes the focus when the sheet shows. */
export function EssentialsFields({ form }: { form: Form }) {
  const text = useTextField(form);
  return (
    <>
      {text('title', { autoFocus: true })}
      {text('subtitle')}
      <AuthorsField value={form.values.authors} error={form.errors.authors} onChange={(a) => form.setValue('authors', a)} />
      <div className={styles.pair}>
        {text('publisher')}
        {text('year', { inputMode: 'numeric' })}
      </div>
    </>
  );
}

export function EditionFields({ form }: { form: Form }) {
  const t = useT();
  const text = useTextField(form);
  return (
    <>
      <div className={styles.pair}>
        {text('language')}
        {text('pages', { inputMode: 'numeric' })}
      </div>
      <Field label={t('books.form.format')}>
        <Select
          value={form.values.format || 'none'}
          onValueChange={(v) => form.setValue('format', v === 'none' ? '' : v)}
          options={[
            { value: 'none', label: t('books.form.formatNone') },
            ...FORMATS.map((f) => ({ value: f, label: t(`books.detail.formats.${f}`) })),
          ]}
        />
      </Field>
      <div className={styles.pair}>
        {text('isbn10')}
        {text('isbn13')}
      </div>
    </>
  );
}

export function CollectionFields({ form }: { form: Form }) {
  const t = useT();
  const text = useTextField(form);
  return (
    <>
      {text('genre')}
      <div className={styles.pair}>
        <Field label={t('books.form.progressive')} error={form.errors.progressive}>
          <Input
            name="progressive"
            inputMode="numeric"
            value={form.values.progressive}
            onChange={(e) => form.setValue('progressive', e.target.value)}
          />
        </Field>
        {text('condition')}
      </div>
      <div className={styles.pair}>
        {text('acquired', { type: 'date' })}
        {text('price', { inputMode: 'decimal' })}
      </div>
      <OwnerField value={form.values.owner} onChange={(id) => form.setValue('owner', id)} />
    </>
  );
}

export function NotesFields({ form }: { form: Form }) {
  const t = useT();
  const area = (name: 'description' | 'notes') => (
    <Field label={t(`books.form.${name}`)} error={form.errors[name]}>
      <Textarea name={name} rows={4} value={form.values[name]} onChange={(e) => form.setValue(name, e.target.value)} />
    </Field>
  );
  return (
    <>
      {area('description')}
      {area('notes')}
    </>
  );
}
