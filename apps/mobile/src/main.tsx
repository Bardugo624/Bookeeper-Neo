import '@bookeeper/ui/fonts.css';
import '@bookeeper/ui/tokens.css';
import '@bookeeper/ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { AppProviders, buildRoutes, collectModules } from './app';
import { browserPlatform } from './platform';

const platform = browserPlatform(registerSW);
const router = createHashRouter(buildRoutes(collectModules()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
