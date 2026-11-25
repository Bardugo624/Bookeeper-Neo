import type { ReactNode } from 'react';
import type { Locale } from '@bookeeper/i18n';
import { LocaleProvider } from '../app/i18n';
import { PlatformProvider, type Platform } from '../platform';
import { fakePlatform } from '../platform/testing';

/** Providers the kit needs in tests: locale and platform (for the confirm call). */
export function KitWrapper({ children, locale = 'it', platform }: { children: ReactNode; locale?: Locale; platform?: Platform }) {
  return (
    <PlatformProvider platform={platform ?? fakePlatform()}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </PlatformProvider>
  );
}
