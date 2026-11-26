import { Button, Icon, IconButton } from '@bookeeper/ui/base';
import type { WishOut } from '@bookeeper/api';
import { useLocale, useT } from '../../app';
import { StatusTag, formatDate } from '../../kit';
import { PRIORITIES, priorityKey, safeHref } from './model';
import styles from './WishCard.module.css';

export interface WishCardProps {
  wish: WishOut;
  /** Level of the title, one below the heading of its group. */
  titleLevel?: 'h2' | 'h3';
  /** Write actions, or null for a read-only role. */
  actions: { onEdit(): void; onDelete(): void; onConvert(): void; converting: boolean; locked: boolean } | null;
}

const TONES = { low: 'neutral', medium: 'warn', high: 'danger' } as const;

export function WishCard({ wish, actions, titleLevel: Title = 'h2' }: WishCardProps) {
  const t = useT();
  const locale = useLocale();
  const key = priorityKey(wish.priority);
  const href = safeHref(wish.source_url);
  const labels = Object.fromEntries(PRIORITIES.map((p) => [p, t(`wishlist.priority.${p}`)])) as Record<(typeof PRIORITIES)[number], string>;

  return (
    <li className={`${styles.card} ${key === 'high' ? styles.high : ''}`}>
      <div className={styles.top}>
        <Title className={styles.title}>{wish.title}</Title>
        <StatusTag status={key} tones={TONES} labels={labels} />
      </div>
      {wish.authors ? <p className={styles.author}>{wish.authors}</p> : null}
      {wish.notes ? <p className={styles.notes}>{wish.notes}</p> : null}
      <p className={styles.meta}>
        <span>{t('wishlist.card.added', { date: formatDate(locale, wish.created_at) })}</span>
        {wish.isbn ? <span>{t('wishlist.card.isbn', { isbn: wish.isbn })}</span> : null}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className={styles.link}>
            <Icon name="link" size={14} />
            {t('wishlist.card.link')}
          </a>
        ) : wish.source_url ? (
          <span>{wish.source_url}</span>
        ) : null}
      </p>
      {actions ? (
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            icon="check"
            loading={actions.converting}
            loadingLabel={t('wishlist.convert.working')}
            disabled={actions.locked}
            onClick={actions.onConvert}
            aria-label={t('wishlist.convert.label', { title: wish.title })}
          >
            {t('wishlist.convert.button')}
          </Button>
          <IconButton icon="pencil" size="sm" label={t('wishlist.card.edit', { title: wish.title })} onClick={actions.onEdit} />
          <IconButton icon="trash" size="sm" tone="danger" label={t('wishlist.card.delete', { title: wish.title })} onClick={actions.onDelete} />
        </div>
      ) : null}
    </li>
  );
}
