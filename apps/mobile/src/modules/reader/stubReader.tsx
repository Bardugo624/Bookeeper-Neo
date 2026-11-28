import { createElement } from 'react';
import { loadSettings, resolveTheme } from '@bookeeper/reader/model';

/** The props the stub reader got, one entry per render. */
export const reader = { props: [] as Record<string, any>[] };

/** Stands in for `ReaderApp` (the tests of the route do not need the engine). */
export function StubReaderApp(props: Record<string, any>) {
  reader.props.push(props);
  // Like the real reader: a root that says which theme it draws.
  const theme = resolveTheme(loadSettings(localStorage).theme, props.appDark);
  return createElement('div', { 'data-testid': 'reader', 'data-platform': props.platform, 'data-file': props.file.id, 'data-theme': theme });
}
