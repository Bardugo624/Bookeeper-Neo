import { useLocation, useNavigate, useRouteError } from 'react-router';
import { ErrorState } from '../kit/ErrorState';

/** Route error boundary: replaces the failed view, says what failed when the error tells, and offers the fitting action. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    // A fresh navigation to the same address clears the router's error state.
    <ErrorState error={error} onRetry={() => navigate(location.pathname + location.search, { replace: true })} />
  );
}
