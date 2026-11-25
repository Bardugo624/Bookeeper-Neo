import { useNavigate } from 'react-router';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import styles from './Pair.module.css';

/** `/pair` without a code: how to get the QR on the computer. */
export function IntroPage() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Screen
      title={t('mpair.intro.title')}
      footer={
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => navigate('/pair/code')}>
            {t('mpair.intro.haveCode')}
          </Button>
        </div>
      }
    >
      <div className={styles.content}>
        <p className={styles.lead}>{t('mpair.intro.text')}</p>
        <ol className={styles.steps} aria-label={t('mpair.intro.stepsLabel')}>
          {(['step1', 'step2', 'step3'] as const).map((k) => (
            <li key={k} className={styles.step}>
              {t(`mpair.intro.${k}`)}
            </li>
          ))}
        </ol>
      </div>
    </Screen>
  );
}
