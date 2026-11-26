import { useNavigate } from 'react-router';
import { ApiError } from '@bookeeper/api';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { useSession } from '../session';

export interface ErrorStateProps {
  /** What was thrown; an `ApiError` tells what happened, anything else gets the generic text. */
  error?: unknown;
  /** Runs again what failed. Without it there is no retry button. */
  onRetry?: () => void;
}

type Kind = 'network' | 'unauthorized' | 'forbidden' | 'notFound' | 'generic';

function kindOf(error: unknown): Kind {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 0 || error.code === 'network') return 'network';
  if (error.code === 'unauthorized' || error.status === 401) return 'unauthorized';
  if (error.code === 'forbidden' || error.status === 403) return 'forbidden';
  if (error.code === 'not_found' || error.status === 404) return 'notFound';
  return 'generic';
}

/**
 * The error state of a whole view: says what failed when it knows, and offers the action that fits
 * (retry when trying again can help, a way out when it cannot).
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const t = useT();
  const navigate = useNavigate();
  const signOut = useSession((s) => s.signOut);
  const kind = kindOf(error);
  const prefix = kind === 'generic' ? 'shell.error' : `shell.error.${kind}`;
  // A missing page or a refused one does not get better by retrying: send the user back to the books.
  const leaves = kind === 'forbidden' || kind === 'notFound';
  return (
    <EmptyState
      icon="alert"
      title={t(`${prefix}.title`)}
      text={t(`${prefix}.text`)}
      action={
        kind === 'unauthorized' ? (
          // Trying again would be refused again: the way forward is to sign in anew.
          <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
            {t('shell.error.signOut')}
          </Button>
        ) : leaves ? (
          <Button variant="secondary" onClick={() => navigate('/books')}>
            {t('shell.error.home')}
          </Button>
        ) : onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t('shell.error.retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
