import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../../app/i18n';
import { PlatformProvider, isTauri, tauriPlatform } from '../../platform';
import { UpdateBanner } from './UpdateBanner';

let mounted = false;

/**
 * The shell is not ours to edit, so the banner lives in its own root in `document.body`.
 * Only the desktop app has updates; elsewhere (browser, tests) nothing is mounted.
 */
export function mountUpdatesPortal(): void {
  if (mounted || typeof document === 'undefined' || !isTauri()) return;
  mounted = true;
  const host = document.createElement('div');
  host.dataset.updates = 'portal';
  document.body.appendChild(host);
  createRoot(host).render(
    <LocaleProvider>
      <PlatformProvider platform={tauriPlatform()}>
        <UpdateBanner />
      </PlatformProvider>
    </LocaleProvider>,
  );
}
