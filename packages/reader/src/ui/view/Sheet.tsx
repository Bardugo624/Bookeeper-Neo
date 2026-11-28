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
/** The top band, in px, that grabs the sheet to pull it up. */
const GRIP = 28;

/**
 * The phone's sheet from the bottom: a `Dialog` anchored to the bottom edge, as `BottomSheet` in the
 * app. `Dialog` takes no class name, so the open sheet marks `<html>` and `Sheet.module.css` restyles it.
 * It opens at 70% of the height; pulling the top band takes it up to the full height.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  const t = useReaderT();
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset[FLAG] = '';
    let dialog: HTMLElement | null = null;
    let startY = 0;
    let startH = 0;
    let pulling = false;
    const down = (e: PointerEvent) => {
      if (!dialog || e.clientY - dialog.getBoundingClientRect().top > GRIP) return;
      pulling = true;
      startY = e.clientY;
      startH = dialog.getBoundingClientRect().height;
      try {
        dialog.setPointerCapture?.(e.pointerId);
      } catch {
        /* a pointer that is already gone */
      }
    };
    const move = (e: PointerEvent) => {
      if (!pulling || !dialog) return;
      const h = Math.min(window.innerHeight, Math.max(window.innerHeight * 0.3, startH + startY - e.clientY));
      dialog.style.setProperty('--reader-sheet-h', `${h}px`);
    };
    const up = () => {
      pulling = false;
    };
    const mark = () => {
      if (dialog?.isConnected) return;
      const all = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const found = all[all.length - 1] ?? null;
      if (!found) return;
      dialog = found;
      dialog.dataset.readerSheetDialog = '';
      dialog.addEventListener('pointerdown', down);
      dialog.addEventListener('pointermove', move);
      dialog.addEventListener('pointerup', up);
      dialog.addEventListener('pointercancel', up);
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      delete root.dataset[FLAG];
      if (dialog) {
        dialog.removeEventListener('pointerdown', down);
        dialog.removeEventListener('pointermove', move);
        dialog.removeEventListener('pointerup', up);
        dialog.removeEventListener('pointercancel', up);
        delete dialog.dataset.readerSheetDialog;
      }
    };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer} closeLabel={t('reader.sheet.close')}>
      {children}
    </Dialog>
  );
}
