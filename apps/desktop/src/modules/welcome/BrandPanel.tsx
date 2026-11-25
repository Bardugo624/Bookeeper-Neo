import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import styles from './WelcomeView.module.css';

const COVERS = [
  { key: 'cover1', width: 78 },
  { key: 'cover2', width: 92 },
  { key: 'cover3', width: 70 },
  { key: 'cover4', width: 100 },
] as const;

/** The left side of the first screen: brand, the promise, and four placeholder covers. */
export function BrandPanel() {
  const t = useT();
  return (
    <aside className={styles.brandPanel}>
      <p className={styles.brand}>{t('welcome.brand.label')}</p>
      <div>
        <p className={styles.hero}>{t('welcome.hero.title')}</p>
        <p className={styles.heroText}>{t('welcome.hero.text')}</p>
      </div>
      <div className={styles.covers} aria-hidden="true">
        {COVERS.map((c) => (
          <BookCover key={c.key} title={t(`welcome.hero.${c.key}`)} width={c.width} />
        ))}
      </div>
    </aside>
  );
}
