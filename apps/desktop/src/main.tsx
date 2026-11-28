import '@bookeeper/ui/fonts.css';
import '@bookeeper/ui/tokens.css';
import '@bookeeper/ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import { AppProviders, buildRoutes, collectModules } from './app';
import { browserPlatform, installFileDropGuard, isTauri, tauriPlatform } from './platform';

const platform = isTauri() ? tauriPlatform() : browserPlatform(import.meta.env.VITE_API_URL ?? '');
installFileDropGuard();
const router = createHashRouter(buildRoutes(collectModules()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
