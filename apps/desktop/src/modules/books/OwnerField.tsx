import { Field } from '@bookeeper/ui/base';
import { Select } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { usePeople } from './usePeople';

const EVERYONE = 'everyone';

/** "Whose is it": everyone, or one of the people of the library ("You" for the caller). */
export function OwnerField({ value, onChange }: { value: string; onChange(id: string): void }) {
  const t = useT();
  const people = usePeople();
  return (
    <Field label={t('books.form.owner')}>
      <Select
        value={value || EVERYONE}
        onValueChange={(v) => onChange(v === EVERYONE ? '' : v)}
        options={[
          { value: EVERYONE, label: t('books.owner.everyone') },
          ...people.map((p) => ({ value: p.id, label: p.is_me ? t('books.owner.me') : p.display_name })),
        ]}
      />
    </Field>
  );
}
