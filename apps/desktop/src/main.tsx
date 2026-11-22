import '@bookeeper/ui/tokens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@bookeeper/api';
import { resolveLocale } from '@bookeeper/i18n';
import { App } from './App';
import { createTauriTransport } from './transport';

const client = createClient(createTauriTransport());
const locale = resolveLocale('system', navigator.language);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={client} locale={locale} />
  </StrictMode>,
);
