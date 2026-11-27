import { useState } from 'react';
import type { SetupInfo } from '../bridge';
import { SetupLayout, useQuotes } from '../shell';

/** Placeholder: `setup-ui-install` replaces this folder. It already shows the frontispiece. */
export function InstallFlow({ info }: { info: SetupInfo; onUninstall(): void }) {
  const { pick } = useQuotes();
  const [quote] = useState(() => pick('welcome'));
  return (
    <SetupLayout quote={quote} compact={false} panelHeight="short">
      <div data-flow="install" data-version={info.payload?.version} />
    </SetupLayout>
  );
}
