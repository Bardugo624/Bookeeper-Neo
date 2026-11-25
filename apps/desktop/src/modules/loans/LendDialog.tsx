import { LoanFormDialog } from './LoanFormDialog';

export interface LendDialogProps {
  book: { id: string; title: string };
  open: boolean;
  onClose(): void;
}

/** "New loan" with the book already chosen: used by the book page's "Lend" button. */
export function LendDialog({ book, open, onClose }: LendDialogProps) {
  if (!open) return null;
  return <LoanFormDialog mode={{ kind: 'create', book }} onClose={onClose} />;
}
