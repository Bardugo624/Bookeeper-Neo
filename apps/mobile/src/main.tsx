import '@bookeeper/ui/tokens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, createFetchTransport } from '@bookeeper/api';
import { resolveLocale } from '@bookeeper/i18n';
import { App } from './App';

const client = createClient(createFetchTransport(window.location.origin));
const locale = resolveLocale('system', navigator.language);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={client} locale={locale} secure={window.isSecureContext} />
  </StrictMode>,
);
