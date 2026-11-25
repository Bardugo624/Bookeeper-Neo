import type { AppModule } from '../../app/types';
import { mountUpdatesPortal } from './portal';

/** No page and no menu entry: loading this module is what puts the update banner on screen. */
export const module: AppModule = { id: 'updates', routes: [] };

mountUpdatesPortal();
