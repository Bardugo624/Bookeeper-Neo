import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { Book3D } from '@bookeeper/ui/book';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import styles from './FirstBookCelebration.module.css';

export interface FirstBookCelebrationProps {
  /** The book just added; the dialog is shown while it is set. */
  book: BookOut | null;
  onAnother(): void;
  onClose(): void;
}

/** The first book of a library: sober, no confetti. The book rises in, a line of text, two buttons. */
export function FirstBookCelebration({ book, onAnother, onClose }: FirstBookCelebrationProps) {
  const t = useT();
  return (
    <Dialog
      open={book !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('onboarding.celebration.title')}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onAnother}>
            {t('onboarding.celebration.another')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('onboarding.celebration.library')}
          </Button>
        </div>
      }
    >
      {book ? (
        <div className={styles.body}>
          <div className={styles.rise}>
            <Book3D
              title={book.title}
              author={book.authors.join(', ') || undefined}
              color={book.cover_color ?? undefined}
              pages={book.page_count ?? undefined}
              width={160}
            />
          </div>
          <p className={styles.line}>{t('onboarding.celebration.line', { title: book.title })}</p>
        </div>
      ) : null}
    </Dialog>
  );
}
