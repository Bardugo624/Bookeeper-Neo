import { Button } from '@bookeeper/ui/base';
import type { InviteOut } from '@bookeeper/api';
import { useLocale, useT } from '../../app';
import { formatDate } from '../../kit';
import styles from './InviteList.module.css';

export interface InviteListProps {
  invites: InviteOut[];
  revoke(id: string): void;
  busyId: string | null;
}

/** Invitations nobody has used yet, with a way to take each back. */
export function InviteList({ invites, revoke, busyId }: InviteListProps) {
  const t = useT();
  const locale = useLocale();
  return (
    <section className={styles.section} aria-labelledby="people-invites">
      <h2 id="people-invites" className={styles.title}>
        {t('people.pending.title')}
      </h2>
      {invites.length === 0 ? (
        <p className={styles.empty}>{t('people.pending.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {invites.map((i) => (
            <li key={i.id} className={styles.item}>
              <div className={styles.body}>
                <span className={styles.role}>{t(`people.roles.${i.role}`)}</span>
                <span className={styles.meta}>
                  {t('people.pending.by', { name: i.created_by.display_name })} · {t('people.pending.expires', { date: formatDate(locale, i.expires_at) })}
                </span>
              </div>
              <Button size="sm" variant="secondary" aria-label={t('people.pending.revokeLabel', { role: t(`people.roles.${i.role}`) })} loading={busyId === i.id} loadingLabel={t('common.saving')} onClick={() => revoke(i.id)}>
                {t('people.pending.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
