import { Link } from 'react-router';
import { Button, Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import styles from './FirstBookHint.module.css';

export interface FirstBookHintProps {
  /** Opens the "New book" panel. */
  onAdd(): void;
}

/** The empty library, for those who can write: three steps and "Add the first book". */
export function FirstBookHint({ onAdd }: FirstBookHintProps) {
  const t = useT();
  return (
    <section className={styles.hint} aria-labelledby="first-book-title">
      <span className={styles.glyph} aria-hidden="true">
        <Icon name="book" />
      </span>
      <h2 id="first-book-title" className={styles.title}>
        {t('onboarding.hint.title')}
      </h2>
      <p className={styles.text}>{t('onboarding.hint.text')}</p>
      <ol className={styles.steps}>
        <li>{t('onboarding.hint.steps.add')}</li>
        <li>
          <Link to="/shelves">{t('onboarding.hint.steps.shelf')}</Link>
        </li>
        <li>
          <Link to="/devices">{t('onboarding.hint.steps.devices')}</Link>
        </li>
      </ol>
      <Button variant="primary" onClick={onAdd}>
        {t('onboarding.hint.add')}
      </Button>
    </section>
  );
}
