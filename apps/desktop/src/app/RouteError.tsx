import { useLocation, useNavigate } from 'react-router';
import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from './i18n';

/** Route error boundary: replaces the failed view and offers a retry. */
export function RouteError() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <EmptyState
      icon="alert"
      title={t('shell.error.title')}
      text={t('shell.error.text')}
      action={
        // A fresh navigation to the same address clears the router's error state.
        <Button variant="secondary" onClick={() => navigate(location.pathname + location.search, { replace: true })}>
          {t('shell.error.retry')}
        </Button>
      }
    />
  );
}
