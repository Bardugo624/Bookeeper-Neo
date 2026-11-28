import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Locale } from '@bookeeper/i18n';
import { BridgeProvider, mockBridge, type Bridge, type MockBridge, type Scenario } from '../bridge';
import { LocaleProvider } from './i18n';

export interface RenderOptions {
  scenario?: Scenario;
  locale?: Locale;
  bridge?: MockBridge;
}

/** Renders inside the locale and bridge providers, with the mock bridge for `scenario`. */
export function renderSetup(ui: ReactElement, options: RenderOptions = {}) {
  const bridge: Bridge & Partial<MockBridge> = options.bridge ?? mockBridge(options.scenario ?? 'welcome', { tickMs: 5 });
  const result = render(
    <LocaleProvider locale={options.locale ?? 'it'}>
      <BridgeProvider bridge={bridge}>{ui}</BridgeProvider>
    </LocaleProvider>,
  );
  return { ...result, bridge: bridge as MockBridge };
}
