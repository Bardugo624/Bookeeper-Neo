import type { AppModule } from '../../app/types';
import { CommandPalette } from './CommandPalette';
import { ShortcutsDialog } from './ShortcutsDialog';

/** Mounted once by the shell. */
export function PaletteOverlay({ modules }: { modules: AppModule[] }) {
  return (
    <>
      <CommandPalette modules={modules} />
      <ShortcutsDialog />
    </>
  );
}
