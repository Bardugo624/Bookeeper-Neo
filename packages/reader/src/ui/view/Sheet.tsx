import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Dialog } from '@bookeeper/ui/overlays';
import { useReaderT } from '../../i18n';
import './Sheet.css';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Open as tall as the content, up to 92% of the screen, instead of at 70%. */
  fit?: boolean;
}

const FLAG = 'readerSheet';
/** The top band, in px, that grabs the sheet to pull it up. */
const GRIP = 28;
/** A press on one of these is a press on a control, never a pull. */
const CONTROL = 'button,a[href],input,select,textarea,[role="button"]';

/**
 * The phone's sheet from the bottom: a `Dialog` anchored to the bottom edge, as `BottomSheet` in the
 * app. `Dialog` takes no class name, so a hidden anchor inside the content finds its own dialog, marks
 * it and `Sheet.module.css` restyles it. It opens at 70% of the height (`fit`: as tall as its content, at most 92%); pulling the top band takes it
 * up to the full height.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, fit = false }: SheetProps) {
  const t = useReaderT();
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const anchor = useCallback((el: HTMLSpanElement | null) => {
    setDialog(el ? el.closest<HTMLElement>('[role="dialog"]') : null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset[FLAG] = '';
    return () => {
      delete root.dataset[FLAG];
    };
  }, [open]);

  useEffect(() => {
    if (!dialog) return;
    dialog.dataset.readerSheetDialog = '';
    if (fit) dialog.dataset.readerSheetFit = '';
    else delete dialog.dataset.readerSheetFit;
    let startY = 0;
    let startH = 0;
    let pulling = false;
    const down = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(CONTROL)) return;
      if (e.clientY - dialog.getBoundingClientRect().top > GRIP) return;
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
      if (!pulling) return;
      const h = Math.min(window.innerHeight, Math.max(window.innerHeight * 0.3, startH + startY - e.clientY));
      dialog.style.setProperty('--reader-sheet-h', `${h}px`);
    };
    const up = () => {
      pulling = false;
    };
    dialog.addEventListener('pointerdown', down);
    dialog.addEventListener('pointermove', move);
    dialog.addEventListener('pointerup', up);
    dialog.addEventListener('pointercancel', up);
    return () => {
      dialog.removeEventListener('pointerdown', down);
      dialog.removeEventListener('pointermove', move);
      dialog.removeEventListener('pointerup', up);
      dialog.removeEventListener('pointercancel', up);
      delete dialog.dataset.readerSheetDialog;
      delete dialog.dataset.readerSheetFit;
    };
  }, [dialog, fit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer} closeLabel={t('reader.sheet.close')}>
      <span ref={anchor} data-reader-sheet-anchor hidden />
      {children}
    </Dialog>
  );
}
