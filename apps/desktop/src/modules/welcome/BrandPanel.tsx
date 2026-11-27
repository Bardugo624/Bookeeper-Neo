import { Quotation, quoteSize, useOpeningQuote } from '@bookeeper/ui/quote';
import { useLocale, useT } from '../../app/i18n';
import mark from './mark.png';
import styles from './WelcomeView.module.css';

/** The left side of the first screen: the brand, a writer's quotation, and today's promise. */
export function BrandPanel() {
  const t = useT();
  const locale = useLocale();
  const entry = useOpeningQuote(locale);
  const quote = entry[locale];
  return (
    <aside className={styles.brandPanel}>
      <p className={styles.brand}>
        <img className={styles.mark} src={mark} alt="" width={22} height={22} />
        {t('welcome.brand.label')}
      </p>
      <div className={styles.quoteSlot}>
        {quote ? <Quotation className={styles.quotation} quote={quote} size={quoteSize(quote.text, { columnPx: 348 })} /> : null}
      </div>
      <p className={styles.heroText}>{t('welcome.hero.text')}</p>
    </aside>
  );
}
