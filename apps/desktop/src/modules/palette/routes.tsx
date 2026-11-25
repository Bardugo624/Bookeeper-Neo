import type { AppModule } from '../../app';
import { PaletteOverlay } from './PaletteOverlay';

/** No page and no navigation entry: only the palette and the shortcut list, drawn by the shell. */
export const module: AppModule = { id: 'palette', routes: [], overlay: PaletteOverlay };
