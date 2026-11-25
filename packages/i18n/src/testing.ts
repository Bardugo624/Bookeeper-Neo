// Test-only entry point (`@bookeeper/i18n/testing`). Not part of the public API.
import type { Locale } from './index';

export type Messages = { [key: string]: string | Messages };

/** Catalogs shared with `index.ts`, which fills and reads them. */
export const catalogs: Record<Locale, Messages> = { it: {}, en: {} };

/** Test hook: injects a namespace into one catalog. */
export function __setForTest(locale: Locale, namespace: string, messages: Messages): void {
  catalogs[locale][namespace] = messages;
}
