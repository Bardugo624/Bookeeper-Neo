import type { InviteRole, PersonOut } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { RadioGroup } from './RadioGroup';

export interface RoleDialogProps {
  person: PersonOut;
  /** Roles the person doing this may hand out. */
  roles: InviteRole[];
  save(role: InviteRole): Promise<unknown>;
  onClose(): void;
}

interface Values {
  role: InviteRole;
}

/** Mounted only while open, so every opening starts from the current role. */
export function RoleDialog({ person, roles, save, onClose }: RoleDialogProps) {
  const t = useT();
  const current = roles.find((r) => r === person.role) ?? roles[roles.length - 1]!;
  const form = useFormState<Values>({ role: current }, () => ({}));
  const submit = form.submit(async (v) => {
    if (v.role !== person.role) await save(v.role);
    onClose();
  });

  return (
    <FormDialog
      open
      title={t('people.role.title', { name: person.display_name })}
      error={form.submitError ? apiErrorMessage(t, form.submitError) : null}
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <RadioGroup
        legend={t('people.role.legend')}
        name="role"
        value={form.values.role}
        options={roles.map((r) => ({ value: r, label: t(`people.roles.${r}`) }))}
        onChange={(role) => form.setValue('role', role)}
      />
    </FormDialog>
  );
}
