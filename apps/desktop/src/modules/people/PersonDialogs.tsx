import type { PersonOut } from '@bookeeper/api';
import { useT } from '../../app';
import { ConsequencesDialog } from './ConsequencesDialog';
import { RenameDialog } from './RenameDialog';
import { RoleDialog } from './RoleDialog';
import { assignableRoles, type PersonAction } from './model';
import type { usePeople } from './usePeople';
import type { Role } from '../../kit';

export interface OpenDialog {
  action: PersonAction;
  person: PersonOut;
}

export interface PersonDialogsProps {
  open: OpenDialog | null;
  actorRole: Role | null;
  actions: ReturnType<typeof usePeople>;
  onClose(): void;
}

/** The dialog for the chosen action, if any. Each one is mounted only while open. */
export function PersonDialogs({ open, actorRole, actions, onClose }: PersonDialogsProps) {
  const t = useT();
  if (!open) return null;
  const { action, person } = open;
  const name = person.display_name;

  switch (action) {
    case 'role':
      return (
        <RoleDialog
          key={person.id}
          person={person}
          roles={assignableRoles(actorRole)}
          save={(role) => actions.update.mutateAsync({ id: person.id, patch: { role } })}
          onClose={onClose}
        />
      );
    case 'rename':
      return <RenameDialog key={person.id} person={person} save={(display_name) => actions.update.mutateAsync({ id: person.id, patch: { display_name } })} onClose={onClose} />;
    case 'remove':
      return (
        <ConsequencesDialog
          title={t('people.remove.title', { name })}
          intro={t('people.remove.intro', { name })}
          consequences={[1, 2, 3].map((n) => t(`people.remove.effects.${n}`))}
          confirmLabel={t('people.remove.confirm')}
          tone="danger"
          run={() => actions.remove.mutateAsync(person.id)}
          onClose={onClose}
        />
      );
    case 'leave':
      return (
        <ConsequencesDialog
          title={t('people.leave.title')}
          intro={t('people.leave.intro')}
          consequences={[1, 2, 3].map((n) => t(`people.leave.effects.${n}`))}
          confirmLabel={t('people.leave.confirm')}
          tone="danger"
          run={() => actions.leave.mutateAsync(person.id)}
          onClose={onClose}
        />
      );
    case 'owner':
      return (
        <ConsequencesDialog
          title={t('people.owner.title', { name })}
          intro={t('people.owner.intro', { name })}
          consequences={[t('people.owner.effects.1', { name }), t('people.owner.effects.2')]}
          confirmLabel={t('people.owner.confirm', { name })}
          run={() => actions.transfer.mutateAsync(person.id)}
          onClose={onClose}
        />
      );
  }
}
