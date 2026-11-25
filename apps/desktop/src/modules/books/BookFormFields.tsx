import { Field, Input, Textarea } from '@bookeeper/ui/base';
import { Select } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import type { FormState } from '../../kit';
import { AuthorsField } from './AuthorsField';
import { FORMATS, type BookFormValues } from './bookForm';
import styles from './BookForm.module.css';

type Form = FormState<BookFormValues>;
type TextKey = Exclude<keyof BookFormValues, 'authors'>;

function useTextField(form: Form) {
  const t = useT();
  return (name: TextKey, extra: { type?: string; inputMode?: 'numeric' | 'decimal'; hint?: string } = {}) => (
    <Field label={t(`books.form.${name}`)} error={form.errors[name]} description={extra.hint}>
      <Input
        name={name}
        type={extra.type}
        inputMode={extra.inputMode}
        value={form.values[name]}
        onChange={(e) => form.setValue(name, e.target.value)}
      />
    </Field>
  );
}

/** The four groups of the form: Essentials, Edition, Collection, Notes. */
export function BookFormFields({ form }: { form: Form }) {
  const t = useT();
  const text = useTextField(form);
  const area = (name: 'description' | 'notes') => (
    <Field label={t(`books.form.${name}`)} error={form.errors[name]}>
      <Textarea name={name} rows={4} value={form.values[name]} onChange={(e) => form.setValue(name, e.target.value)} />
    </Field>
  );
  return (
    <>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('books.form.groups.essentials')}</legend>
        {text('title')}
        {text('subtitle')}
        <AuthorsField value={form.values.authors} error={form.errors.authors} onChange={(a) => form.setValue('authors', a)} />
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('books.form.groups.edition')}</legend>
        {text('publisher')}
        <div className={styles.pair}>
          {text('year', { inputMode: 'numeric' })}
          {text('language')}
        </div>
        <div className={styles.pair}>
          {text('pages', { inputMode: 'numeric' })}
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
        </div>
        <div className={styles.pair}>
          {text('isbn10')}
          {text('isbn13')}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('books.form.groups.collection')}</legend>
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
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('books.form.groups.notes')}</legend>
        {area('description')}
        {area('notes')}
      </fieldset>
    </>
  );
}
