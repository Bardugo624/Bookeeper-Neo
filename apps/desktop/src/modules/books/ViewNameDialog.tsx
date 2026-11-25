import { useState, type FormEvent } from 'react';
import { Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { FormDialog } from '../../kit';
import { MAX_NAME } from './useSavedViews';

export interface ViewNameDialogProps {
  open: boolean;
  onSave(name: string): void;
  onCancel(): void;
}

/** Asks for the name of the view being saved. */
export function ViewNameDialog({ open, onSave, onCancel }: ViewNameDialogProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setInvalid(true);
    onSave(name);
  };
  return (
    <FormDialog open={open} title={t('books.views.saveTitle')} onSubmit={submit} onCancel={onCancel}>
      <Field label={t('books.views.name')} error={invalid ? t('common.required') : undefined}>
        <Input value={name} maxLength={MAX_NAME} autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
