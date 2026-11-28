import '@bookeeper/ui/fonts.css';
import '@bookeeper/ui/tokens.css';
import '@bookeeper/ui/base.css';
import './app/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { BridgeProvider, isTauri, mockBridge, scenarioFromHash, tauriBridge } from './bridge';
import { LocaleProvider } from './shell';

const bridge = isTauri() ? tauriBridge() : mockBridge(scenarioFromHash(window.location.hash));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <BridgeProvider bridge={bridge}>
        <App />
      </BridgeProvider>
    </LocaleProvider>
  </StrictMode>,
);
