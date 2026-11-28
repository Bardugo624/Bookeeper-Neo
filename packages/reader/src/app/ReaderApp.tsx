import type { ReactNode } from 'react';
import type { Locale } from '@bookeeper/i18n';
import { ToastProvider, TooltipProvider, type MenuEntry } from '@bookeeper/ui/overlays';
import type { ReaderBackend } from '../data';
import { ReaderLocale, useReaderT } from '../i18n';
import { ReaderScreen } from './ReaderScreen';

export interface ReaderAppProps {
  backend: ReaderBackend;
  book: { id: string; title: string; authors: string[] };
  file: { id: string; sha256: string; format: string; name: string };
  platform: 'desktop' | 'phone';
  locale: Locale;
  /** The app is dark now: «Auto» follows it. */
  appDark: boolean;
  /** After the buttons of the top bar: the window's own controls (computer). */
  topEnd?: ReactNode;
  /** Phone: more items for the «⋯» menu, after «Apri la scheda del libro». */
  menuItems?: MenuEntry[];
  onClose: () => void;
}

function Providers({ children }: { children: ReactNode }) {
  const t = useReaderT();
  return (
    <TooltipProvider>
      <ToastProvider closeLabel={t('reader.sheet.close')}>{children}</ToastProvider>
    </TooltipProvider>
  );
}

/** The reader: the engine, the model, the interface and the data of one book, put together. */
export function ReaderApp(props: ReaderAppProps) {
  return (
    <ReaderLocale locale={props.locale}>
      <Providers>
        <ReaderScreen {...props} />
      </Providers>
    </ReaderLocale>
  );
}
