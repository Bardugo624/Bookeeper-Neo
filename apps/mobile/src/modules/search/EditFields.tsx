import { useId, type ReactNode } from 'react';
import type { PersonOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { AuthorsEditor } from './AuthorsEditor';
import { FORMATS, type EditErrors, type EditKey, type EditValues } from './editModel';
import styles from './Edit.module.css';

function Row({ label, error, children }: { label: string; error?: string; children: (props: { id: string; invalid: boolean; describedBy?: string }) => ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({ id, invalid: Boolean(error), describedBy: error ? errorId : undefined })}
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface Props {
  values: EditValues;
  errors: EditErrors;
  people: PersonOut[];
  meId: string | undefined;
  set: <K extends EditKey>(key: K, value: EditValues[K]) => void;
}

/** The fields of the book form. Texts are free; year and pages open the numeric keyboard. */
export function EditFields({ values, errors, people, meId, set }: Props) {
  const t = useT();
  const text = (key: Exclude<EditKey, 'authors' | 'format' | 'owner'>, numeric = false) => (
    <Row label={t(`msearch.edit.${key === 'title' ? 'titleField' : key}`)} error={errors[key]}>
      {({ id, invalid, describedBy }) => (
        <input
          id={id}
          name={key}
          className={styles.input}
          value={values[key]}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...(numeric ? { inputMode: 'numeric' as const, pattern: '[0-9]*' } : {})}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </Row>
  );
  return (
    <>
      {text('title')}
      {text('subtitle')}
      <AuthorsEditor value={values.authors} error={errors.authors} onChange={(next) => set('authors', next)} />
      {text('publisher')}
      {text('year', true)}
      {text('pages', true)}
      {text('language')}
      {text('genre')}
      <Row label={t('msearch.edit.format')} error={errors.format}>
        {({ id }) => (
          <select id={id} name="format" className={styles.input} value={values.format} onChange={(e) => set('format', e.target.value)}>
            <option value="">{t('msearch.edit.formatNone')}</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {t(`msearch.edit.formats.${f}`)}
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row label={t('msearch.edit.owner')} error={errors.owner}>
        {({ id }) => (
          <select id={id} name="owner" className={styles.input} value={values.owner} onChange={(e) => set('owner', e.target.value)}>
            <option value="">{t('msearch.edit.ownerNone')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === meId ? t('msearch.detail.you') : p.display_name}
              </option>
            ))}
          </select>
        )}
      </Row>
    </>
  );
}
