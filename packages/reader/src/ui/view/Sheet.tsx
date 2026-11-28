import { useEffect, type ReactNode } from 'react';
import { Dialog } from '@bookeeper/ui/overlays';
import { useReaderT } from '../../i18n';
import './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

const FLAG = 'readerSheet';

/**
 * The phone's sheet from the bottom: a `Dialog` anchored to the bottom edge, as `BottomSheet` in the
 * app. `Dialog` takes no class name, so the open sheet marks `<html>` and `Sheet.module.css` restyles it.
 * It opens at 70% of the height; the dialog's own scroll takes it to the top.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  const t = useReaderT();
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset[FLAG] = '';
    return () => {
      delete root.dataset[FLAG];
    };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer} closeLabel={t('reader.sheet.close')}>
      {children}
    </Dialog>
  );
}
