import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from '../base/Icon';
import { IconButton } from '../base/IconButton';
import { cx } from '../base/cx';
import styles from './Toast.module.css';
import { useAutoDismiss } from './useAutoDismiss';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastEntry extends ToastInput {
  id: number;
  tone: ToastTone;
}

export interface ToastApi {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 3;
const DURATION_MS = 5000;
const ICONS: Record<ToastTone, IconName> = { neutral: 'info', ok: 'check', warn: 'alert', danger: 'alert' };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Accessible name of each toast's close button (already translated by the caller). */
  closeLabel: string;
}

function ToastItem({ toast, closeLabel, onDismiss }: { toast: ToastEntry; closeLabel: string; onDismiss: () => void }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  useAutoDismiss(DURATION_MS, hover || focus, onDismiss);
  return (
    <div
      className={cx(styles.toast, styles[toast.tone])}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <span className={styles.icon}>
        <Icon name={ICONS[toast.tone]} size={16} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description ? <p className={styles.description}>{toast.description}</p> : null}
      </div>
      <IconButton icon="close" label={closeLabel} size="sm" onClick={onDismiss} />
    </div>
  );
}

export function ToastProvider({ children, closeLabel }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useMemo(() => ({ current: 0 }), []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (input: ToastInput) => {
      const id = ++nextId.current;
      setToasts((list) => [...list, { ...input, id, tone: input.tone ?? 'neutral' }]);
      return id;
    },
    [nextId],
  );
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  // Oldest first; the rest wait in the queue until a visible toast goes away.
  const visible = toasts.slice(0, MAX_VISIBLE);
  const render = (list: ToastEntry[]) =>
    list.map((toast) => (
      <ToastItem key={toast.id} toast={toast} closeLabel={closeLabel} onDismiss={() => dismiss(toast.id)} />
    ));

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport}>
        <div role="status" aria-live="polite" className={styles.region}>
          {render(visible.filter((t) => t.tone !== 'danger'))}
        </div>
        <div role="alert" aria-live="assertive" className={styles.region}>
          {render(visible.filter((t) => t.tone === 'danger'))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
