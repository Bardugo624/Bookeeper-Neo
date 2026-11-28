import { useEffect, type ReactNode } from 'react';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../app/i18n';
import './BottomSheet.css';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

const FLAG = 'bottomSheet';

/**
 * A `Dialog` anchored to the bottom edge. `Dialog` takes no class name, so the open sheet marks
 * `<html>` and `BottomSheet.css` restyles the dialog panel while the mark is there.
 */
export function BottomSheet({ open, onOpenChange, title, description, children, footer }: BottomSheetProps) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset[FLAG] = '';
    return () => {
      delete root.dataset[FLAG];
    };
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
      closeLabel={t('mobile.close')}
    >
      {children}
    </Dialog>
  );
}
