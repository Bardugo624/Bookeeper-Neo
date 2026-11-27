import { useState } from 'react';
import type { SetupInfo } from '../bridge';
import { SetupLayout, useQuotes } from '../shell';

/** Placeholder: `setup-ui-uninstall` replaces this folder. It already shows the frontispiece. */
export function UninstallFlow({ info }: { info: SetupInfo }) {
  const { pick } = useQuotes();
  const [quote] = useState(() => pick('farewell'));
  return (
    <SetupLayout quote={quote} compact panelHeight="tall">
      <div data-flow="uninstall" data-version={info.installed?.version} />
    </SetupLayout>
  );
}
