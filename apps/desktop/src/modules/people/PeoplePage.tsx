import { useState } from 'react';
import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { PageHeader, apiErrorMessage, usePermission, ErrorState } from '../../kit';
import { useServerInfo } from '../devices';
import { useSession } from '../../session';
import { InviteDialog } from './InviteDialog';
import { InviteList } from './InviteList';
import { PersonDialogs, type OpenDialog } from './PersonDialogs';
import { PersonRow } from './PersonRow';
import { assignableRoles, canInvite, personActions, phoneAddress } from './model';
import { useInvites, usePeople } from './usePeople';
import styles from './PeoplePage.module.css';

export function PeoplePage() {
  const t = useT();
  const { role } = usePermission();
  const meId = useSession((s) => s.me?.user.id);
  const inviter = canInvite(role);
  const people = usePeople();
  const invites = useInvites(inviter);
  const server = useServerInfo(inviter);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actor = role && meId ? { id: meId, role } : null;
  const { query } = people;
  const revoke = async (id: string) => {
    setError(null);
    try {
      await invites.revoke.mutateAsync(id);
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  let body;
  if (query.isPending) {
    body = (
      <div role="status" aria-label={t('people.loading')} className={styles.list}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={64} />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  } else {
    body = (
      <ul className={styles.list} aria-label={t('people.title')}>
        {query.data.map((p) => (
          <PersonRow key={p.id} person={p} actions={personActions(actor, p)} onAction={(action) => setDialog({ action, person: p })} />
        ))}
      </ul>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('people.title')}
        count={query.data ? t('people.count', { count: query.data.length }) : undefined}
        actions={
          inviter ? (
            <Button variant="primary" icon="plus" onClick={() => setInviting(true)}>
              {t('people.invite.open')}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {body}
      {inviter && invites.query.isError ? (
        <div role="alert" className={styles.inlineError}>
          <span>{t('people.pending.error')}</span>
          <Button size="sm" variant="secondary" onClick={() => void invites.query.refetch()}>
            {t('people.pending.retry')}
          </Button>
        </div>
      ) : null}
      {inviter && invites.query.data ? <InviteList invites={invites.query.data} revoke={(id) => void revoke(id)} busyId={invites.revoke.isPending ? (invites.revoke.variables ?? null) : null} /> : null}
      {inviting ? (
        <InviteDialog roles={assignableRoles(role)} phoneUrl={phoneAddress(server.data)} create={(b) => invites.create.mutateAsync(b)} onClose={() => setInviting(false)} />
      ) : null}
      <PersonDialogs open={dialog} actorRole={role} actions={people} onClose={() => setDialog(null)} />
    </div>
  );
}
