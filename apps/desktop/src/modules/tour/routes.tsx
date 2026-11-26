import type { AppModule } from '../../app';
import { TourOverlay } from './TourOverlay';

/** No page and no navigation entry: only the lamp and the card, drawn by the shell. */
export const module: AppModule = { id: 'tour', routes: [], overlay: TourOverlay };
