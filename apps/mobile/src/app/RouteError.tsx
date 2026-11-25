import { useLocation, useNavigate } from 'react-router';
import { ErrorState } from '../kit/ErrorState';
import { useT } from './i18n';

/** Route error boundary: replaces the failed view and offers a retry. */
export function RouteError() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <ErrorState
      message={t('mobile.error.text')}
      // A fresh navigation to the same address clears the router's error state.
      onRetry={() => navigate(location.pathname + location.search, { replace: true })}
    />
  );
}
