import { useState } from 'react';
import { Button, DangerAction, DangerZone } from '@bookeeper/ui/base';
import type { PersonOut } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, useFormState } from '../../kit';
import { RadioGroup } from './RadioGroup';

export interface PeopleDangerZoneProps {
  /** The person using the app, as listed. */
  me: PersonOut;
  people: PersonOut[];
  onLeave(): void;
  /** The owner picked who gets the library. */
  onTransfer(to: PersonOut): void;
}

interface Values {
  to: string;
}

/** Who becomes the owner: the one step the confirmation needs first. */
function PickOwnerDialog({ candidates, onPick, onClose }: { candidates: PersonOut[]; onPick(p: PersonOut): void; onClose(): void }) {
  const t = useT();
  const form = useFormState<Values>({ to: candidates[0]!.id }, () => ({}));
  const submit = form.submit(async (v) => {
    const chosen = candidates.find((c) => c.id === v.to);
    if (chosen) onPick(chosen);
  });
  return (
    <FormDialog
      open
      title={t('people.danger.owner.pickTitle')}
      submitLabel={t('people.danger.owner.next')}
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <RadioGroup
        legend={t('people.danger.owner.legend')}
        name="new-owner"
        value={form.values.to}
        options={candidates.map((c) => ({ value: c.id, label: c.display_name }))}
        onChange={(to) => form.setValue('to', to)}
      />
    </FormDialog>
  );
}

/** The bottom of the page: what the person using the app can do that they cannot take back. */
export function PeopleDangerZone({ me, people, onLeave, onTransfer }: PeopleDangerZoneProps) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const owner = me.role === 'owner';
  const candidates = people.filter((p) => p.id !== me.id);
  if (owner && candidates.length === 0) return null;

  return (
    <>
      <DangerZone title={t('people.danger.title')} headingLevel="h2">
        {owner ? (
          <DangerAction
            title={t('people.danger.owner.title')}
            consequence={t('people.danger.owner.consequence')}
            action={
              <Button variant="secondary" tone="danger" onClick={() => setPicking(true)}>
                {t('people.danger.owner.title')}
              </Button>
            }
          />
        ) : (
          <DangerAction
            title={t('people.danger.leave.title')}
            consequence={t('people.danger.leave.consequence')}
            action={
              <Button variant="danger" onClick={onLeave}>
                {t('people.danger.leave.title')}
              </Button>
            }
          />
        )}
      </DangerZone>
      {picking ? (
        <PickOwnerDialog
          candidates={candidates}
          onPick={(p) => {
            setPicking(false);
            onTransfer(p);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}
