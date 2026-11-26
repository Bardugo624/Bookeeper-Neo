import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { cx } from '../../kit';
import { NAME_MAX } from './loanModel';
import type { useLendForm } from './useLendForm';
import styles from './Loans.module.css';

type Form = ReturnType<typeof useLendForm>;

/** Who takes the book: a person of the library, a name used before, or a new name. */
export function BorrowerChoice({ form }: { form: Form }) {
  const t = useT();
  const { values, choices, messages } = form;
  const names = choices.names.filter((n) => n.trim().toLowerCase() !== values.name.trim().toLowerCase());
  return (
    <fieldset className={styles.group}>
      <legend className={styles.label}>{t('mloans.lend.person')}</legend>
      {choices.people.length > 0 ? (
        <ul className={styles.choices} aria-label={t('mloans.lend.people')}>
          {choices.people
            .filter((p) => !p.is_me)
            .map((p) => (
              <li key={p.id}>
                <button type="button" aria-pressed={values.userId === p.id} className={cx(styles.choice, values.userId === p.id && styles.on)} onClick={() => form.pickPerson(p.id)}>
                  <Icon name="library" size={16} />
                  <span className={styles.name}>{p.display_name}</span>
                </button>
              </li>
            ))}
        </ul>
      ) : null}
      <label className={styles.field}>
        <span className={styles.hint}>{t('mloans.lend.or')}</span>
        <input
          type="text"
          className={styles.input}
          aria-label={t('mloans.lend.name')}
          placeholder={t('mloans.lend.namePlaceholder')}
          aria-invalid={messages.borrower ? true : undefined}
          autoCapitalize="words"
          autoComplete="off"
          maxLength={NAME_MAX * 2}
          value={values.name}
          onChange={(e) => form.setName(e.target.value)}
        />
      </label>
      {!values.userId && names.length > 0 ? (
        <ul className={styles.choices} aria-label={t('mloans.lend.names')}>
          {names.map((n) => (
            <li key={n}>
              <button type="button" className={styles.choice} onClick={() => form.setName(n)}>
                <span className={styles.name}>{n}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {messages.borrower ? (
        <p role="alert" className={styles.error}>
          {messages.borrower}
        </p>
      ) : null}
    </fieldset>
  );
}
