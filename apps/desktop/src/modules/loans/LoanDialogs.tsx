import { useT } from '../../app';
import { ConfirmDialog } from '../../kit';
import { LoanFormDialog } from './LoanFormDialog';
import { useBorrowerLabel } from './useBorrowerLabel';
import { ReturnDialog } from './ReturnDialog';
import type { LoanDialog } from './useLoanDialogs';
import type { LoanOut } from '@bookeeper/api';

export interface LoanDialogsProps {
  dialog: LoanDialog | null;
  deleting: boolean;
  onClose(): void;
  onConfirmDelete(loan: LoanOut): void;
}

export function LoanDialogs({ dialog, deleting, onClose, onConfirmDelete }: LoanDialogsProps) {
  const t = useT();
  const labelOf = useBorrowerLabel();
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'new':
      return <LoanFormDialog mode={{ kind: 'create' }} onClose={onClose} />;
    case 'edit':
      return <LoanFormDialog mode={{ kind: 'edit', loan: dialog.loan }} onClose={onClose} />;
    case 'return':
      return <ReturnDialog loan={dialog.loan} onClose={onClose} />;
    case 'delete':
      return (
        <ConfirmDialog
          open
          tone="danger"
          busy={deleting}
          title={t('loans.delete.title')}
          description={t('loans.delete.description', { title: dialog.loan.book_title, name: labelOf(dialog.loan) })}
          confirmLabel={t('common.delete')}
          onConfirm={() => onConfirmDelete(dialog.loan)}
          onCancel={onClose}
        />
      );
  }
}
